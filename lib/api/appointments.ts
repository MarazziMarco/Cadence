import { createClient } from '@/lib/supabase/client'
import { mutateCalendarOrThrow } from '@/lib/api/calendar'
import type { AppointmentLocationMode } from '@/lib/types/db'

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
  manual_override: boolean
  version: number
  location_mode?: AppointmentLocationMode
  location_address?: string | null
  location_city?: string | null
  location_postal_code?: string | null
  location_latitude?: number | null
  location_longitude?: number | null
  location_geocoding_status?: string | null
  location_address_hash?: string | null
  location_geocoded_at?: string | null
  patients?: {
    first_name: string
    last_name: string | null
    full_name: string | null
    color: string | null
    phone: string | null
    email: string | null
    address?: string | null
    city?: string | null
    postal_code?: string | null
  } | null
  services?: {
    name: string
    color: string | null
    buffer_before_minutes: number
    buffer_after_minutes: number
    max_daily_bookings: number | null
  } | null
}

const SELECT = 'id, appointment_date, start_time, end_time, duration_minutes, status, color, title, price, patient_id, service_id, locked, manual_override, version, location_mode, location_address, location_city, location_postal_code, location_latitude, location_longitude, location_geocoding_status, location_address_hash, location_geocoded_at, patients:patient_id ( first_name, last_name, full_name, color, phone, email, address, city, postal_code ), services:service_id ( name, color, buffer_before_minutes, buffer_after_minutes, max_daily_bookings )'

export async function listAppointments(businessId: string, startDate: string, endDate: string): Promise<CalendarAppointment[]> {
  const { data, error } = await sb().from('appointments').select(SELECT)
    .eq('business_id', businessId).is('deleted_at', null)
    .in('status', ['scheduled', 'confirmed'])
    .gte('appointment_date', startDate).lte('appointment_date', endDate)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as any as CalendarAppointment[]
}

export async function createAppointment(businessId: string, values: any) {
  const result = await mutateCalendarOrThrow({
    businessId,
    operation: 'create',
    idempotencyKey: crypto.randomUUID(),
    values: { status: 'scheduled', source: 'manual', ...values },
  })
  return result.appointment
}

export async function updateAppointment(
  businessId: string,
  id: string,
  expectedVersion: number,
  values: any,
) {
  const result = await mutateCalendarOrThrow({
    businessId,
    operation: 'update',
    appointmentId: id,
    expectedVersion,
    idempotencyKey: crypto.randomUUID(),
    values,
  })
  return result.appointment
}

export async function deleteAppointment(
  businessId: string,
  id: string,
  expectedVersion: number,
) {
  const result = await mutateCalendarOrThrow({
    businessId,
    operation: 'delete',
    appointmentId: id,
    expectedVersion,
    idempotencyKey: crypto.randomUUID(),
    values: {},
  })
  return result.appointment
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
