import { createClient } from '@/lib/supabase/client'

const sb = () => createClient()
const SELECT = '*, patients:patient_id ( first_name, last_name, full_name, color ), services:preferred_service_id ( name, emoji )'

export async function listWaiting(businessId: string) {
  const { data, error } = await sb().from('waiting_list').select(SELECT).eq('business_id', businessId).is('deleted_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createWaiting(businessId: string, values: any) {
  const { error } = await sb().from('waiting_list').insert({ business_id: businessId, ...values })
  if (error) throw error
}

export async function updateWaiting(id: string, values: any) {
  const { error } = await sb().from('waiting_list').update(values).eq('id', id)
  if (error) throw error
}

export async function deleteWaiting(id: string) {
  const { error } = await sb().from('waiting_list').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

const ADVANCE_MIN_DAYS = 3

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/**
 * Adds a "move me up" waiting-list entry linked to an existing appointment: if an
 * earlier slot frees up (>= ADVANCE_MIN_DAYS before it), the optimizer will pull
 * this appointment into it before shuffling anyone else. Marked in notes as
 * {advance_for:<appointmentId>}. No schema change.
 */
export async function createAdvanceWaiting(businessId: string, params: {
  patientId: string; appointmentId: string; appointmentDate: string; serviceId: string | null; durationMinutes: number
}): Promise<void> {
  const latest = new Date(params.appointmentDate + 'T00:00:00')
  latest.setDate(latest.getDate() - ADVANCE_MIN_DAYS)
  const { error } = await sb().from('waiting_list').insert({
    business_id: businessId,
    patient_id: params.patientId,
    preferred_service_id: params.serviceId,
    preferred_duration_minutes: params.durationMinutes,
    priority: 'high',
    earliest_date: ymd(new Date()),
    latest_date: ymd(latest),
    flexible: true,
    active: true,
    notes: JSON.stringify({ advance_for: params.appointmentId }),
  })
  if (error) throw error
}

/** True if a waiting-list row is an "advance" (move-me-up) entry. */
export function advanceApptId(row: any): string | null {
  try { const j = JSON.parse(row?.notes || ''); return typeof j?.advance_for === 'string' ? j.advance_for : null } catch { return null }
}
