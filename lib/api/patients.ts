import { createClient } from '@/lib/supabase/client'
import type { Patient, Weekday } from '@/lib/types/db'

const sb = () => createClient()
export type PatientFilter = 'all' | 'vip' | 'archived'

export async function listPatients(businessId: string, search: string, filter: PatientFilter): Promise<Patient[]> {
  let q = sb().from('patients').select('*').eq('business_id', businessId).is('deleted_at', null).order('created_at', { ascending: false })
  if (filter === 'archived') q = q.eq('archived', true)
  else q = q.eq('archived', false)
  if (filter === 'vip') q = q.eq('is_vip', true)
  const s = search.trim()
  if (s) q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Patient[]
}

export async function getPatient(id: string): Promise<Patient | null> {
  const { data, error } = await sb().from('patients').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return data as Patient | null
}

function clean<T extends Record<string, any>>(v: T) {
  const { full_name, ...rest } = v as any
  return rest
}

export async function createPatient(businessId: string, values: Partial<Patient>): Promise<Patient> {
  const { data, error } = await sb().from('patients').insert({ business_id: businessId, ...clean(values) }).select('*').single()
  if (error) throw error
  return data as Patient
}

export async function updatePatient(id: string, values: Partial<Patient>): Promise<Patient> {
  const { data, error } = await sb().from('patients').update(clean(values)).eq('id', id).select('*').single()
  if (error) throw error
  return data as Patient
}

export async function softDeletePatient(id: string): Promise<void> {
  const { error } = await sb().from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function setPatientFlag(id: string, patch: Partial<Pick<Patient, 'is_vip' | 'archived' | 'blacklisted'>>): Promise<void> {
  const { error } = await sb().from('patients').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Replaces a patient's recurring weekday availability. When set, the optimizer
 * only places this patient on the given weekdays (any time of day). Passing an
 * empty list clears the constraint (patient becomes flexible again). Uses the
 * existing patient_availability table — no schema change.
 */
export async function setPatientWeekdayAvailability(patientId: string, weekdays: Weekday[]): Promise<void> {
  const client = sb()
  // Soft-delete any existing recurring availability so we don't stack duplicates.
  await client.from('patient_availability').update({ deleted_at: new Date().toISOString() })
    .eq('patient_id', patientId).is('deleted_at', null)
  if (weekdays.length === 0) return
  const rows = weekdays.map((w) => ({
    patient_id: patientId,
    weekday: w,
    start_time: '00:00:00',
    end_time: '23:59:00',
    priority: 'normal',
    recurring: true,
  }))
  const { error } = await client.from('patient_availability').insert(rows)
  if (error) throw error
}
