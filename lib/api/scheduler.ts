import { createClient } from '@/lib/supabase/client'
import { timeToMin } from '@/lib/api/appointments'

// NOTE: optimization logic lives in the Supabase Edge Function 'optimize-schedule'.
// The frontend only invokes it and renders/applies the resulting preview.
// (The former in-app heuristic engine is no longer used from here.)

const sb = () => createClient()

export async function runOptimization(businessId: string, dateFrom: string, dateTo: string): Promise<string> {
  const { data, error } = await sb().functions.invoke('optimize-schedule', {
    body: { business_id: businessId, date_from: dateFrom, date_to: dateTo },
  })
  if (error) throw new Error(error.message || 'Edge function error')
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
