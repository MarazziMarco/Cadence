import { createClient } from '@/lib/supabase/client'
import type { Patient } from '@/lib/types/db'

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

function withFullName<T extends { first_name?: string | null; last_name?: string | null }>(v: T) {
  const full = [v.first_name, v.last_name].filter(Boolean).join(' ').trim()
  return { ...v, full_name: full || v.first_name || null }
}

export async function createPatient(businessId: string, values: Partial<Patient>): Promise<Patient> {
  const { data, error } = await sb().from('patients').insert({ business_id: businessId, ...withFullName(values) }).select('*').single()
  if (error) throw error
  return data as Patient
}

export async function updatePatient(id: string, values: Partial<Patient>): Promise<Patient> {
  const { data, error } = await sb().from('patients').update(withFullName(values)).eq('id', id).select('*').single()
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
