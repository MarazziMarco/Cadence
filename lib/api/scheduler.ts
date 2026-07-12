import { createClient } from '@/lib/supabase/client'
import { timeToMin } from '@/lib/api/appointments'

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

// Accept a single change. Write order matters (see request): mutate the schedule
// first, then flag accepted=true last, so a mid-failure leaves the row "to apply".
export async function acceptChange(businessId: string, runId: string, change: any) {
  const client = sb()
  if (change.appointment_id) {
    // Move
    const { error } = await client.from('appointments').update({
      appointment_date: change.new_date, start_time: change.new_start_time, end_time: change.new_end_time,
    }).eq('id', change.appointment_id)
    if (error) throw error
    const { error: aErr } = await client.from('optimization_changes').update({ accepted: true }).eq('id', change.id)
    if (aErr) throw aErr
    // If this move fulfils an "advance" (move-me-up) request, close that entry.
    const { data: wls } = await client.from('waiting_list')
      .select('id, notes').eq('business_id', businessId).eq('patient_id', change.patient_id).eq('active', true).is('deleted_at', null)
    for (const w of wls ?? []) {
      let advFor: string | null = null
      try { advFor = JSON.parse((w as any).notes || '')?.advance_for ?? null } catch {}
      if (advFor === change.appointment_id) {
        await client.from('waiting_list').update({ active: false, matched_appointment_id: change.appointment_id, matched_at: new Date().toISOString() }).eq('id', (w as any).id)
      }
    }
  } else {
    // Insert from waiting list
    const dur = change.new_start_time && change.new_end_time ? timeToMin(change.new_end_time) - timeToMin(change.new_start_time) : 30
    const { data: wl } = await client.from('waiting_list')
      .select('id, preferred_service_id, services:preferred_service_id ( price )')
      .eq('business_id', businessId).eq('patient_id', change.patient_id).eq('active', true).is('deleted_at', null)
      .limit(1).maybeSingle()
    const { data: appt, error } = await client.from('appointments').insert({
      business_id: businessId, patient_id: change.patient_id, service_id: wl?.preferred_service_id ?? null,
      appointment_date: change.new_date, start_time: change.new_start_time, end_time: change.new_end_time,
      duration_minutes: dur, price: (wl as any)?.services?.price ?? null,
      status: 'scheduled', source: 'ai', generated_by_ai: true, optimization_run_id: runId,
    }).select('id').single()
    if (error) throw error
    if (wl?.id) {
      await client.from('waiting_list').update({ matched_appointment_id: appt.id, matched_at: new Date().toISOString(), active: false }).eq('id', wl.id)
    }
    const { error: aErr } = await client.from('optimization_changes').update({ accepted: true }).eq('id', change.id)
    if (aErr) throw aErr
  }
}

export async function rejectChange(change: any) {
  const { error } = await sb().from('optimization_changes').update({ deleted_at: new Date().toISOString() }).eq('id', change.id)
  if (error) throw error
}
