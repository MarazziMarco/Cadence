// loadInput: materializes a SolverInput from Supabase. This is the ONLY place
// (besides persist.ts) that touches the DB. solveCore never imports the client.
//
// Applies the mandatory loader filters from the spec (§2):
//   - appointments: status in (scheduled, confirmed), deleted_at is null, in range
//   - waiting_list: active, matched_appointment_id is null, deleted_at is null
//   - services with allow_ai_scheduling=false are still loaded; the core treats
//     their appointments as anchors.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import type {
  Mode,
  OptimizationStrategy,
  Patient,
  PatientAvailability,
  PatientException,
  Service,
  Settings,
  SolverInput,
  WaitingListEntry,
  WorkingHour,
} from "./types.ts";

export interface LoadArgs {
  business_id: string;
  date_from: string;
  date_to: string;
  settings_id?: string;
  mode?: Mode;
  scope_kind?: "day" | "week" | "month" | "custom";
  week_key?: string | null;
  allow_cross_week?: boolean;
  max_cross_week_days?: number;
}

// "advance" waiting-list entries store {"advance_for":"<appointmentId>"} in notes.
function parseAdvanceFor(notes: unknown): string | null {
  if (typeof notes !== "string" || !notes) return null;
  try {
    const j = JSON.parse(notes);
    return typeof j?.advance_for === "string" ? j.advance_for : null;
  } catch {
    return null;
  }
}

export async function loadInput(
  supabase: SupabaseClient,
  args: LoadArgs,
): Promise<SolverInput> {
  const { business_id, date_from, date_to } = args;

  // --- algorithm_settings (active row, or the one requested) ---
  let settingsQ = supabase
    .from("algorithm_settings")
    .select("*")
    .eq("business_id", business_id);
  settingsQ = args.settings_id
    ? settingsQ.eq("id", args.settings_id)
    : settingsQ.eq("active", true);
  const { data: settingsRow, error: settingsErr } = await settingsQ
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  if (!settingsRow) throw new Error("no active algorithm_settings row found");

  const settings: Settings = {
    weight_idle_time: num(settingsRow.weight_idle_time, 1),
    weight_patient_preference: num(settingsRow.weight_patient_preference, 5),
    weight_revenue: num(settingsRow.weight_revenue, 3),
    weight_continuity: num(settingsRow.weight_continuity, 8),
    weight_vip: num(settingsRow.weight_vip, 100),
    weight_manual_lock: num(settingsRow.weight_manual_lock, 1000),
    weight_waiting_list: num(settingsRow.weight_waiting_list, 4),
    weight_free_slots: num(settingsRow.weight_free_slots, 2),
    max_patient_moves: num(settingsRow.max_patient_moves, 2),
    max_daily_moves: num(settingsRow.max_daily_moves, 5),
    max_solver_seconds: num(settingsRow.max_solver_seconds, 30),
    allow_split_days: bool(settingsRow.allow_split_days, true),
    allow_waiting_list: bool(settingsRow.allow_waiting_list, true),
    fill_gaps_first: bool(settingsRow.fill_gaps_first, true),
    preserve_existing_schedule: bool(settingsRow.preserve_existing_schedule, true),
    use_ai_explanations: bool(settingsRow.use_ai_explanations, true),
    metadata: settingsRow.metadata ?? {},
  };
  const mode: Mode = args.mode ?? settingsRow.optimization_mode ?? "balanced";
  const strategy: OptimizationStrategy =
    settings.metadata?.OPTIMIZATION_STRATEGY === "smart_route"
      ? "smart_route"
      : "balanced";

  // --- working_hours (7 rows) ---
  const { data: whRows, error: whErr } = await supabase
    .from("working_hours")
    .select("weekday, is_open, morning_start, morning_end, afternoon_start, afternoon_end")
    .eq("business_id", business_id);
  if (whErr) throw whErr;
  const working_hours: WorkingHour[] = (whRows ?? []) as WorkingHour[];

  // --- holidays overlapping the range ---
  const { data: holRows, error: holErr } = await supabase
    .from("business_holidays")
    .select("start_date, end_date, is_closed, affects_scheduler")
    .eq("business_id", business_id)
    .is("deleted_at", null)
    .lte("start_date", date_to)
    .gte("end_date", date_from);
  if (holErr) throw holErr;
  const holidays = (holRows ?? []).map((h) => ({
    start_date: h.start_date,
    end_date: h.end_date,
    is_closed: bool(h.is_closed, true),
    affects_scheduler: bool(h.affects_scheduler, true),
  }));

  // --- services ---
  const { data: svcRows, error: svcErr } = await supabase
    .from("services")
    .select(
      "id, duration_minutes, price, buffer_before_minutes, buffer_after_minutes, allow_ai_scheduling, max_daily_bookings, minimum_notice_hours, maximum_days_in_advance",
    )
    .eq("business_id", business_id)
    .is("deleted_at", null);
  if (svcErr) throw svcErr;
  const services: Service[] = (svcRows ?? []).map((s) => ({
    id: s.id,
    duration_minutes: num(s.duration_minutes, 0),
    price: num(s.price, 0),
    buffer_before_minutes: num(s.buffer_before_minutes, 0),
    buffer_after_minutes: num(s.buffer_after_minutes, 0),
    allow_ai_scheduling: bool(s.allow_ai_scheduling, true),
    max_daily_bookings: s.max_daily_bookings ?? null,
    minimum_notice_hours: num(s.minimum_notice_hours, 0),
    maximum_days_in_advance: s.maximum_days_in_advance ?? null,
  }));

  // --- appointments (mandatory filters) ---
  const { data: apptRows, error: apptErr } = await supabase
    .from("appointments")
    .select(
      "id, version, patient_id, service_id, appointment_date, start_time, end_time, duration_minutes, price, locked, manual_override, source",
    )
    .eq("business_id", business_id)
    .is("deleted_at", null)
    .in("status", ["scheduled", "confirmed"])
    .gte("appointment_date", date_from)
    .lte("appointment_date", date_to);
  if (apptErr) throw apptErr;
  const appointments = (apptRows ?? []).map((a) => ({
    id: a.id,
    version: num(a.version, 1),
    patient_id: a.patient_id,
    service_id: a.service_id ?? null,
    appointment_date: a.appointment_date,
    start_time: a.start_time,
    end_time: a.end_time,
    duration_minutes: num(a.duration_minutes, 0),
    price: num(a.price, 0),
    locked: bool(a.locked, false),
    manual_override: bool(a.manual_override, false),
    source: a.source ?? "manual",
    location_key: "studio:unknown",
  }));

  // --- waiting_list (mandatory filters) ---
  const { data: wlRows, error: wlErr } = await supabase
    .from("waiting_list")
    .select(
      "id, patient_id, preferred_service_id, priority, earliest_date, latest_date, preferred_weekdays, earliest_time, latest_time, preferred_duration_minutes, flexible, notes",
    )
    .eq("business_id", business_id)
    .eq("active", true)
    .is("matched_appointment_id", null)
    .is("deleted_at", null)
    .lte("earliest_date", date_to)
    .gte("latest_date", date_from);
  if (wlErr) throw wlErr;
  const waiting_list: WaitingListEntry[] = (wlRows ?? []).map((w) => ({
    id: w.id,
    patient_id: w.patient_id,
    preferred_service_id: w.preferred_service_id ?? null,
    priority: w.priority ?? "normal",
    earliest_date: w.earliest_date,
    latest_date: w.latest_date,
    preferred_weekdays: w.preferred_weekdays ?? null,
    earliest_time: w.earliest_time ?? null,
    latest_time: w.latest_time ?? null,
    preferred_duration_minutes: w.preferred_duration_minutes ?? null,
    flexible: bool(w.flexible, true),
    advance_for: parseAdvanceFor(w.notes),
  }));

  // --- patients referenced by appts or waiting list ---
  const patientIds = [
    ...new Set([
      ...appointments.map((a) => a.patient_id),
      ...waiting_list.map((w) => w.patient_id),
    ]),
  ].filter(Boolean);

  let patients: Patient[] = [];
  let patient_availability: PatientAvailability[] = [];
  let patient_exceptions: PatientException[] = [];

  if (patientIds.length > 0) {
    const { data: patRows, error: patErr } = await supabase
      .from("patients")
      .select(
        "id, is_vip, preferred_service_id, preferred_duration_minutes, no_show_count, average_days_between_visits",
      )
      .in("id", patientIds);
    if (patErr) throw patErr;
    patients = (patRows ?? []).map((p) => ({
      id: p.id,
      is_vip: bool(p.is_vip, false),
      preferred_service_id: p.preferred_service_id ?? null,
      preferred_duration_minutes: p.preferred_duration_minutes ?? null,
      no_show_count: num(p.no_show_count, 0),
      average_days_between_visits: p.average_days_between_visits ?? null,
    }));

    const { data: availRows, error: availErr } = await supabase
      .from("patient_availability")
      .select(
        "patient_id, weekday, start_time, end_time, priority, is_available, valid_from, valid_until, recurring",
      )
      .in("patient_id", patientIds)
      .is("deleted_at", null);
    if (availErr) throw availErr;
    patient_availability = (availRows ?? []) as PatientAvailability[];

    const { data: excRows, error: excErr } = await supabase
      .from("patient_exceptions")
      .select("patient_id, exception_date, is_available, start_time, end_time")
      .in("patient_id", patientIds)
      .is("deleted_at", null)
      .gte("exception_date", date_from)
      .lte("exception_date", date_to);
    if (excErr) throw excErr;
    patient_exceptions = (excRows ?? []) as PatientException[];
  }

  return {
    context: {
      business_id,
      date_from,
      date_to,
      now: new Date().toISOString(),
      mode,
      settings,
      scope_kind: args.scope_kind,
      week_key: args.week_key ?? null,
      allow_cross_week: args.allow_cross_week ?? false,
      max_cross_week_days: args.max_cross_week_days ?? 7,
    },
    working_hours,
    holidays,
    services,
    patients,
    patient_availability,
    patient_exceptions,
    appointments,
    waiting_list,
    studio_location_key: "studio:unknown",
    travel_matrix: {},
    strategy,
    route_thresholds: {
      walk_max_minutes: num(settings.metadata?.WALK_MAX_MINUTES, 9),
      unknown_studio_leg_minutes: num(
        settings.metadata?.UNKNOWN_STUDIO_LEG_MINUTES,
        20,
      ),
      smart_route_min_saving_minutes: num(
        settings.metadata?.SMART_ROUTE_MIN_SAVING_MINUTES,
        10,
      ),
    },
  };
}

function num(v: unknown, dflt: number): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return v == null || Number.isNaN(n) ? dflt : n;
}

function bool(v: unknown, dflt: boolean): boolean {
  return v == null ? dflt : Boolean(v);
}
