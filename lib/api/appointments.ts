import { createClient } from '@/lib/supabase/client'
import { mutateCalendar, type CalendarMutationResponse } from '@/lib/api/calendar'

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
  manual_override?: boolean
  version?: number
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
  const result = await mutateCalendar({
    businessId,
    operation: 'create',
    idempotencyKey: crypto.randomUUID(),
    values: { status: 'scheduled', source: 'manual', ...values },
  })
  return unwrapMutation(result)
}

export async function updateAppointment(id: string, values: any) {
  const target = await getMutationTarget(id)
  const result = await mutateCalendar({
    businessId: target.business_id,
    operation: 'update',
    appointmentId: id,
    expectedVersion: target.version,
    idempotencyKey: crypto.randomUUID(),
    values,
  })
  unwrapMutation(result)
}

export async function deleteAppointment(id: string) {
  const target = await getMutationTarget(id)
  const result = await mutateCalendar({
    businessId: target.business_id,
    operation: 'delete',
    appointmentId: id,
    expectedVersion: target.version,
    idempotencyKey: crypto.randomUUID(),
    values: {},
  })
  unwrapMutation(result)
}

async function getMutationTarget(id: string): Promise<{ business_id: string; version: number }> {
  const { data, error } = await sb()
    .from('appointments')
    .select('business_id, version')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (error) throw error
  return data as { business_id: string; version: number }
}

function unwrapMutation(result: CalendarMutationResponse): CalendarAppointment | null {
  if (result.ok) return result.appointment
  const error = new Error(
    result.constraints.map((constraint) => constraint.message).join(' ') || result.code,
  )
  Object.assign(error, { code: result.code, constraints: result.constraints })
  throw error
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

export async function listUpcomingByPatient(patientId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await sb().from('appointments')
    .select('id, appointment_date, start_time, end_time, duration_minutes, status, color, title, services:service_id ( name )')
    .eq('patient_id', patientId).is('deleted_at', null).neq('status', 'cancelled')
    .gte('appointment_date', today).order('appointment_date').order('start_time')
  if (error) throw error
  return data ?? []
}
