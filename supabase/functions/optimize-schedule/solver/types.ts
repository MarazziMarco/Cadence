// Types for the Cadence scheduler solver.
// Source of truth: cadence_solver_data_contract.md (§2 input, §7 output).
// All times are wall-clock "HH:MM" or "HH:MM:SS" strings on input; the core
// normalizes them to minutes-from-midnight internally.

import type { TravelMatrix } from "../routing/matrix.ts";

export type Mode = "conservative" | "balanced" | "aggressive";
export type Priority = "low" | "normal" | "high";
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Tuning constants, read from algorithm_settings.metadata with these defaults. */
export interface Tuning {
  MOVE_BASE?: number; // default 15 — generic disturbance per move
  PRICE_UNIT?: number; // default 10 — normalizes revenue into points
  MIN_IDLE_GAP?: number; // default 5 — minimum gap (min) counted as idle
  W_TRAVEL?: number; // default 1.0 — weight of a travel minute in the cost (spec §2)
  PRIORITIZE_ADVANCE?: boolean; // default true — pull "move me up" clients into freed slots first
  ADVANCE_MIN_DAYS?: number; // default 3 — only advance if the new slot is >= this many days earlier
  WALK_MAX_MINUTES?: number; // routing prep (matrix.ts): max minutes to prefer walking
  UNKNOWN_STUDIO_LEG_MINUTES?: number; // routing prep fallback for an unknown studio leg
  // Day start/end points (spec §1): geocoded coordinates; absent → studio.
  start_location?: { latitude: number; longitude: number } | null;
  end_location?: { latitude: number; longitude: number } | null;
}

/** One active algorithm_settings row (§2 context.settings). */
export interface Settings {
  weight_idle_time: number;
  weight_patient_preference: number;
  weight_revenue: number;
  weight_continuity: number;
  weight_vip: number;
  weight_manual_lock: number;
  weight_waiting_list: number;
  weight_free_slots: number;
  max_patient_moves: number;
  max_daily_moves: number;
  max_solver_seconds: number;
  allow_split_days: boolean;
  allow_waiting_list: boolean;
  fill_gaps_first: boolean;
  preserve_existing_schedule: boolean;
  use_ai_explanations: boolean;
  metadata?: Tuning;
}

export interface SolverContext {
  business_id: string;
  date_from: string; // inclusive, "YYYY-MM-DD"
  date_to: string; // inclusive, "YYYY-MM-DD"
  now: string; // ISO timestamp, for minimum_notice_hours
  mode: Mode;
  settings: Settings;
  scope_kind?: "day" | "week" | "month" | "custom";
  week_key?: string | null;
  allow_cross_week?: boolean;
  max_cross_week_days?: number;
}

export interface WorkingHour {
  weekday: Weekday;
  is_open: boolean;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
}

export interface Holiday {
  start_date: string;
  end_date: string;
  is_closed: boolean;
  affects_scheduler: boolean;
}

export interface Service {
  id: string;
  duration_minutes: number;
  price: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  allow_ai_scheduling: boolean;
  max_daily_bookings: number | null;
  minimum_notice_hours: number;
  maximum_days_in_advance: number | null;
}

export interface Patient {
  id: string;
  is_vip: boolean;
  preferred_service_id: string | null;
  preferred_duration_minutes: number | null;
  no_show_count: number;
  average_days_between_visits: number | null;
}

export interface PatientAvailability {
  patient_id: string;
  weekday: Weekday;
  start_time: string;
  end_time: string;
  priority: Priority;
  is_available: boolean;
  valid_from: string | null;
  valid_until: string | null;
  recurring: boolean;
}

export interface PatientException {
  patient_id: string;
  exception_date: string;
  is_available: boolean; // false + null times = full-day blackout
  start_time: string | null;
  end_time: string | null;
}

export interface Appointment {
  id: string;
  version: number;
  patient_id: string;
  service_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price: number;
  locked: boolean;
  manual_override: boolean;
  source: string;
  location_key: string;
}

export interface WaitingListEntry {
  id: string;
  patient_id: string;
  preferred_service_id: string | null;
  priority: Priority;
  earliest_date: string;
  latest_date: string;
  preferred_weekdays: Weekday[] | null;
  earliest_time: string | null;
  latest_time: string | null;
  preferred_duration_minutes: number | null;
  flexible: boolean;
  // When set, this entry is an existing appointment asking to be moved up into an
  // earlier freed slot (not a brand-new booking). Holds that appointment's id.
  advance_for?: string | null;
  // Pool "to plan" config (spec §7), stored in the waiting_list.notes JSON (no
  // schema change). When present the entry is a multi-session plan: the solver
  // inserts up to `sessions_total` sittings, at most `max_per_week` in any ISO
  // week, at least `gap_hours` apart, within [earliest_date, latest_date] and
  // patient_availability.
  pool?: PoolPlan | null;
}

export interface PoolPlan {
  sessions_total: number; // S — total sittings to place
  max_per_week: number; // M — max sittings per ISO week (0 = unlimited)
  gap_hours: number; // G — minimum hours between two consecutive sittings
}

export interface SolverInput {
  context: SolverContext;
  working_hours: WorkingHour[];
  holidays: Holiday[];
  services: Service[];
  patients: Patient[];
  patient_availability: PatientAvailability[];
  patient_exceptions: PatientException[];
  appointments: Appointment[];
  waiting_list: WaitingListEntry[];
  studio_location_key: string;
  travel_matrix: TravelMatrix;
  // Coordinates per location_key, for the haversine travel fallback (spec §3)
  // and the day's edge legs. Populated by prepareRoutingInput; fixtures may
  // supply it directly. Absent entries fall back to a constant estimate.
  location_coords?: Record<string, { latitude: number; longitude: number }>;
  // Optional day start/end points (spec §1, algorithm_settings.metadata
  // start_location / end_location). Default: studio.
  start_location_key?: string;
  end_location_key?: string;
}

// ---- Output (§7) ---------------------------------------------------------

export interface RunOutput {
  mode: Mode;
  result: "preview";
  objective_score: number; // C(S_final); negative = net improvement
  idle_minutes_before: number;
  idle_minutes_after: number;
  moved_appointments: number;
  unchanged_appointments: number;
  created_appointments: number;
  cancelled_appointments: number;
  total_appointments: number;
  estimated_revenue_before: number;
  estimated_revenue_after: number;
  ai_summary: string;
  execution_time_ms?: number;
}

export interface ChangeOutput {
  kind: "move" | "create";
  appointment_id: string | null; // null for create (row created on accept)
  patient_id: string;
  old_date: string | null;
  old_start_time: string | null;
  old_end_time: string | null;
  new_date: string;
  new_start_time: string;
  new_end_time: string;
  was_moved: boolean;
  ai_reason: string;
}

export interface SolverOutput {
  run: RunOutput;
  changes: ChangeOutput[];
}
