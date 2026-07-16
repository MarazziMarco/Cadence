import { createClient } from '@/lib/supabase/client'

// NOTE: optimization logic lives in the Supabase Edge Function 'optimize-schedule'.
// The frontend only invokes it and renders/applies the resulting preview.
// (The former in-app heuristic engine is no longer used from here.)

const sb = () => createClient()

// Ensures a business always has an active `algorithm_settings` row (required by
// the optimize-schedule Edge Function). Idempotent: only inserts when missing.
// All other columns rely on their DB defaults — we NEVER modify the schema.
export async function ensureAlgorithmSettings(businessId: string): Promise<void> {
  if (!businessId) return
  const client = sb()
  const { data: existing } = await client
    .from('algorithm_settings')
    .select('id')
    .eq('business_id', businessId)
    .eq('active', true)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (existing) return
  const { error } = await client.from('algorithm_settings').insert({ business_id: businessId })
  if (error && !/duplicate|unique/i.test(error.message || '')) {
    // eslint-disable-next-line no-console
    console.warn('ensureAlgorithmSettings:', error.message)
  }
}

// Read the business's saved algorithm settings (the knobs on the Scheduler page).
// These persist and are reused by every optimization — including the quick
// "Optimize" from the calendar/dashboard, which reads this same row.
export async function getAlgorithmSettings(businessId: string) {
  const { data } = await sb()
    .from('algorithm_settings')
    .select('optimization_mode, allow_waiting_list, weight_vip, weight_patient_preference, metadata')
    .eq('business_id', businessId).eq('active', true).is('deleted_at', null)
    .limit(1).maybeSingle()
  return data
}

export async function saveAlgorithmSettings(businessId: string, patch: Record<string, unknown>): Promise<void> {
  if (!businessId) return
  await ensureAlgorithmSettings(businessId)
  const { error } = await sb().from('algorithm_settings').update(patch).eq('business_id', businessId).eq('active', true)
  if (error) throw error
}

// Merge into the jsonb metadata (solver tuning knobs like PRIORITIZE_ADVANCE).
export async function saveAlgorithmMetadata(businessId: string, patch: Record<string, unknown>): Promise<void> {
  if (!businessId) return
  await ensureAlgorithmSettings(businessId)
  const { data } = await sb().from('algorithm_settings').select('metadata').eq('business_id', businessId).eq('active', true).is('deleted_at', null).limit(1).maybeSingle()
  const merged = { ...(((data as any)?.metadata) ?? {}), ...patch }
  const { error } = await sb().from('algorithm_settings').update({ metadata: merged }).eq('business_id', businessId).eq('active', true)
  if (error) throw error
}

export async function runOptimization(businessId: string, dateFrom: string, dateTo: string, opts?: { mode?: string; allowWaitingList?: boolean }): Promise<string> {
  // Make sure the required settings row exists before invoking the Edge Function.
  await ensureAlgorithmSettings(businessId)

  // The Edge Function reads mode/allow_waiting_list off the business's active
  // algorithm_settings row rather than the invoke body, so persist them first.
  if (opts && (opts.mode !== undefined || opts.allowWaitingList !== undefined)) {
    const updates: Record<string, unknown> = {}
    if (opts.mode !== undefined) updates.optimization_mode = opts.mode
    if (opts.allowWaitingList !== undefined) updates.allow_waiting_list = opts.allowWaitingList
    const { error: settingsErr } = await sb().from('algorithm_settings').update(updates).eq('business_id', businessId).eq('active', true)
    if (settingsErr) throw settingsErr
  }

  const { data, error } = await sb().functions.invoke('optimize-schedule', {
    body: { business_id: businessId, date_from: dateFrom, date_to: dateTo },
  })
  if (error) {
    // supabase-js wraps non-2xx responses in FunctionsHttpError, exposing the raw
    // Response on `error.context`. Read it to surface the real server message.
    let message = error.message || 'Edge function error'
    const ctx = (error as any).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json()
        if (body?.error) message = body.error
      } catch {
        try {
          const txt = await ctx.text?.()
          if (txt) message = txt
        } catch {}
      }
    }
    throw new Error(message)
  }
  if (!data || data.error) throw new Error(data?.error || 'Optimization failed')
  if (!data.run_id) throw new Error('No run_id returned')
  return data.run_id as string
}

export async function fetchRun(runId: string) {
  const client = sb()
  const { data: run, error: rErr } = await client.from('optimization_runs').select('*').eq('id', runId).single()
  if (rErr) throw rErr
  const { data: changes, error: cErr } = await client
    .from('optimization_changes')
    .select('*, patients:patient_id ( first_name, full_name, color )')
    .eq('optimization_run_id', runId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (cErr) throw cErr
  return { run, changes: changes ?? [] }
}

export interface OptimizationApplyRequest {
  businessId: string
  runIds: string[]
  selectedChangeIds: string[]
  idempotencyKey: string
}

async function optimizerMutation(body: Record<string, unknown>) {
  const response = await fetch('/api/calendar/optimize/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(result?.error || 'Optimization update failed')
  }
  return result
}

export async function applyOptimizationBatch(
  businessId: string,
  runIds: string[],
  selectedChangeIds: string[],
) {
  const request: OptimizationApplyRequest = {
    businessId,
    runIds,
    selectedChangeIds,
    idempotencyKey: crypto.randomUUID(),
  }
  return optimizerMutation(request)
}

export async function undoOptimizationRun(
  businessId: string,
  runId: string,
) {
  return optimizerMutation({
    action: 'undo',
    businessId,
    runId,
    idempotencyKey: crypto.randomUUID(),
  })
}
