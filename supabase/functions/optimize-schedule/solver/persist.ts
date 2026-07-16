// persistOutput: writes ONE optimization_runs row (result='preview') and N
// optimization_changes rows (accepted=false), mapping 1:1 to the existing
// schema columns. Returns the run id. Does NOT alter appointments or the
// waiting list — those mutate later, on per-row accept (handled by the app).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import type { SolverInput, SolverOutput } from "./types.ts";

export interface PersistArgs {
  businessId: string;
  output: SolverOutput;
  input: SolverInput;
  profileId: string;
  batchId: string;
  scopeKind: "day" | "week" | "month" | "custom";
  scopeFrom: string;
  scopeTo: string;
  weekKey?: string | null;
  allowCrossWeek?: boolean;
}

export async function persistOutput(
  supabase: SupabaseClient,
  args: PersistArgs,
): Promise<string> {
  const { businessId, output, input } = args;
  const r = output.run;
  const appointmentVersions = Object.fromEntries(
    input.appointments.map((appointment) => [
      appointment.id,
      appointment.version,
    ]),
  );

  const { data: runRow, error: runErr } = await supabase
    .from("optimization_runs")
    .insert({
      business_id: businessId,
      profile_id: args.profileId,
      batch_id: args.batchId,
      scope_kind: args.scopeKind,
      scope_from: args.scopeFrom,
      scope_to: args.scopeTo,
      week_key: args.weekKey ?? null,
      allow_cross_week: args.allowCrossWeek ?? false,
      schedule_snapshot: { appointments: appointmentVersions },
      mode: r.mode,
      result: "preview",
      objective_score: r.objective_score,
      idle_minutes_before: r.idle_minutes_before,
      idle_minutes_after: r.idle_minutes_after,
      moved_appointments: r.moved_appointments,
      unchanged_appointments: r.unchanged_appointments,
      created_appointments: r.created_appointments,
      cancelled_appointments: r.cancelled_appointments,
      total_appointments: r.total_appointments,
      estimated_revenue_before: r.estimated_revenue_before,
      estimated_revenue_after: r.estimated_revenue_after,
      ai_summary: r.ai_summary,
      execution_time_ms: r.execution_time_ms ?? null,
      accepted: false,
    })
    .select("id")
    .single();
  if (runErr) throw runErr;

  const runId = runRow.id as string;

  if (output.changes.length > 0) {
    const rows = output.changes.map((c) => ({
      optimization_run_id: runId,
      appointment_id: c.appointment_id, // null for create
      patient_id: c.patient_id,
      old_date: c.old_date,
      old_start_time: c.old_start_time,
      old_end_time: c.old_end_time,
      new_date: c.new_date,
      new_start_time: c.new_start_time,
      new_end_time: c.new_end_time,
      was_moved: c.was_moved,
      accepted: false,
      ai_reason: c.ai_reason,
    }));
    const { error: chErr } = await supabase
      .from("optimization_changes")
      .insert(rows);
    if (chErr) throw chErr;
  }

  return runId;
}
