import { createClient } from '@/lib/supabase/client'

const sb = () => createClient()

export interface CalendarAppointment {
  id: string
  appointment_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  status: string
  color: string | null
  title: string | null
  price: number | null
  patient_id: string
  service_id: string | null
  locked: boolean
  patients?: { first_name: string; last_name: string | null; full_name: string | null; color: string | null } | null
  services?: { name: string; color: string | null } | null
}

const SELECT = 'id, appointment_date, start_time, end_time, duration_minutes, status, color, title, price, patient_id, service_id, locked, patients:patient_id ( first_name, last_name, full_name, color ), services:service_id ( name, color )'

export async function listAppointments(businessId: string, startDate: string, endDate: string): Promise<CalendarAppointment[]> {
  const { data, error } = await sb().from('appointments').select(SELECT)
    .eq('business_id', businessId).is('deleted_at', null)
    .gte('appointment_date', startDate).lte('appointment_date', endDate)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as any as CalendarAppointment[]
}

export async function createAppointment(businessId: string, values: any) {
  const { data, error } = await sb().from('appointments').insert({ business_id: businessId, status: 'scheduled', source: 'manual', ...values }).select('id').single()
  if (error) throw error
  return data
}

export async function updateAppointment(id: string, values: any) {
  const { error } = await sb().from('appointments').update(values).eq('id', id)
  if (error) throw error
}

export async function deleteAppointment(id: string) {
  const { error } = await sb().from('appointments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listPatientsForSelect(businessId: string) {
  const { data, error } = await sb().from('patients').select('id, first_name, last_name, full_name, color, preferred_service_id, preferred_duration_minutes').eq('business_id', businessId).is('deleted_at', null).eq('archived', false).order('first_name')
  if (error) throw error
  return data ?? []
}

// time helpers ('HH:MM:SS' <-> minutes)
export const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const minToTime = (min: number) => { const h = Math.floor(min / 60); const m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00` }
export const fmtTime = (t: string) => { const [h, m] = t.split(':'); return `${h}:${m}` }
