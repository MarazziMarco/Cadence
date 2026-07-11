import { createClient } from '@/lib/supabase/client'

const sb = () => createClient()

// Read-only history of optimization runs + an "undo last applied run" action.
// Uses only existing tables (optimization_runs, optimization_changes,
// appointments, waiting_list) — no schema change.

export interface OptimizationRunRow {
  id: string
  created_at: string
  mode: string
  ai_summary: string | null
  idleRecovered: number
  moved: number
  created: number
  rangeFrom: string | null
  rangeTo: string | null
  appliedCount: number // accepted changes still in effect
}

export interface OptimizationSummary {
  totalRecovered: number
  weekRecovered: number
  runCount: number
}

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

export async function getOptimizationHistory(businessId: string): Promise<{ runs: OptimizationRunRow[]; summary: OptimizationSummary }> {
  const client = sb()
  const { data: runsData, error } = await client
    .from('optimization_runs')
    .select('id, created_at, mode, ai_summary, idle_minutes_before, idle_minutes_after, moved_appointments, created_appointments')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const runs = runsData ?? []
  const ids = runs.map((r: any) => r.id)

  // Pull the changes for these runs once to derive each run's date range and how
  // many of its changes are still applied.
  const byRun = new Map<string, { dates: string[]; applied: number }>()
  if (ids.length) {
    const { data: changes } = await client
      .from('optimization_changes')
      .select('optimization_run_id, old_date, new_date, accepted')
      .in('optimization_run_id', ids)
      .is('deleted_at', null)
    for (const c of changes ?? []) {
      const entry = byRun.get((c as any).optimization_run_id) ?? { dates: [], applied: 0 }
      const d = (c as any).new_date || (c as any).old_date
      if (d) entry.dates.push(d)
      if ((c as any).accepted) entry.applied++
      byRun.set((c as any).optimization_run_id, entry)
    }
  }

  const rows: OptimizationRunRow[] = runs.map((r: any) => {
    const info = byRun.get(r.id)
    const dates = (info?.dates ?? []).sort()
    const idleRecovered = Math.max(0, (r.idle_minutes_before ?? 0) - (r.idle_minutes_after ?? 0))
    return {
      id: r.id,
      created_at: r.created_at,
      mode: r.mode,
      ai_summary: r.ai_summary,
      idleRecovered,
      moved: r.moved_appointments ?? 0,
      created: r.created_appointments ?? 0,
      rangeFrom: dates[0] ?? null,
      rangeTo: dates[dates.length - 1] ?? null,
      appliedCount: info?.applied ?? 0,
    }
  })

  const weekStart = startOfWeek(new Date()).toISOString()
  const summary: OptimizationSummary = {
    totalRecovered: rows.reduce((s, r) => s + r.idleRecovered, 0),
    weekRecovered: rows.filter((r) => r.created_at >= weekStart).reduce((s, r) => s + r.idleRecovered, 0),
    runCount: rows.length,
  }
  return { runs: rows, summary }
}

/**
 * Reverts the most recent run that still has applied changes: moved
 * appointments go back to their old date/time, waiting-list inserts are removed
 * and the entry re-activated. Reconstructed entirely from optimization_changes
 * (old_* fields) — no schema change. Returns the number of appointments touched.
 */
export async function undoLastOptimization(businessId: string): Promise<{ undone: number; runId: string | null }> {
  const client = sb()
  const { data: runs } = await client
    .from('optimization_runs')
    .select('id')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
  const ids = (runs ?? []).map((r: any) => r.id)
  if (!ids.length) return { undone: 0, runId: null }

  const { data: applied } = await client
    .from('optimization_changes')
    .select('*')
    .in('optimization_run_id', ids)
    .eq('accepted', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (!applied || applied.length === 0) return { undone: 0, runId: null }

  const runId = (applied[0] as any).optimization_run_id
  const changes = applied.filter((c: any) => c.optimization_run_id === runId)

  let undone = 0
  for (const c of changes as any[]) {
    if (c.old_date) {
      // A move — restore the previous slot.
      const { error } = await client.from('appointments').update({
        appointment_date: c.old_date, start_time: c.old_start_time, end_time: c.old_end_time,
      }).eq('id', c.appointment_id)
      if (error) throw error
    } else {
      // A waiting-list insert — remove the created appointment and re-activate it.
      await client.from('appointments').update({ deleted_at: new Date().toISOString() }).eq('id', c.appointment_id)
      await client.from('waiting_list').update({ active: true, matched_appointment_id: null, matched_at: null })
        .eq('matched_appointment_id', c.appointment_id)
    }
    undone++
  }
  // Mark the changes as no longer applied so the run drops out of "undoable".
  await client.from('optimization_changes').update({ accepted: false }).in('id', changes.map((c: any) => c.id))
  return { undone, runId }
}
