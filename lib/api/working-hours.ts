import { createClient } from '@/lib/supabase/client'
import {
  BUSINESS_LOCATION_SOURCES,
  type Business,
  type BusinessLocationSource,
  type WorkingHour,
  type Weekday,
} from '@/lib/types/db'

const sb = () => createClient()

export interface PostalAddressInput {
  address: string
  city: string
  postalCode: string
}

export interface BusinessLocationCapture {
  location_latitude: number | null
  location_longitude: number | null
  location_accuracy_meters: number | null
  location_source: BusinessLocationSource | null
  location_captured_at: string | null
}

export type BusinessSettings = Pick<
  Business,
  | 'id'
  | 'default_appointment_duration'
  | 'slot_interval_minutes'
  | 'default_buffer_minutes'
  | 'max_daily_appointments'
  | 'lunch_break_enabled'
  | 'lunch_start'
  | 'lunch_end'
  | 'currency'
  | 'language'
  | 'address'
  | 'city'
  | 'postal_code'
  | keyof BusinessLocationCapture
>

export type BusinessSettingsPatch = Partial<Omit<BusinessSettings, 'id'>>

export function roundApproximateCoordinate(value: number) {
  if (!Number.isFinite(value)) throw new Error('Invalid location coordinate')
  return Number(value.toFixed(5))
}

function normalizeNullableText(value: string | null | undefined) {
  if (typeof value !== 'string') return value
  return value.trim() || null
}

function normalizeBusinessPatch(patch: BusinessSettingsPatch) {
  const normalized = { ...patch }
  for (const key of ['address', 'city', 'postal_code'] as const) {
    if (key in normalized) normalized[key] = normalizeNullableText(normalized[key])
  }
  if ('location_latitude' in normalized && normalized.location_latitude !== null) {
    normalized.location_latitude = roundApproximateCoordinate(
      Number(normalized.location_latitude),
    )
  }
  if ('location_longitude' in normalized && normalized.location_longitude !== null) {
    normalized.location_longitude = roundApproximateCoordinate(
      Number(normalized.location_longitude),
    )
  }
  if (
    'location_accuracy_meters' in normalized
    && normalized.location_accuracy_meters !== null
  ) {
    const accuracy = Number(normalized.location_accuracy_meters)
    if (!Number.isFinite(accuracy) || accuracy < 0) {
      throw new Error('Invalid location accuracy')
    }
    normalized.location_accuracy_meters = Math.round(accuracy)
  }
  if (
    'location_source' in normalized
    && normalized.location_source !== null
    && !(BUSINESS_LOCATION_SOURCES as readonly string[]).includes(
      String(normalized.location_source),
    )
  ) {
    throw new Error('Invalid business location source')
  }
  return normalized
}

export async function listWorkingHours(businessId: string): Promise<WorkingHour[]> {
  const { data, error } = await sb().from('working_hours').select('*').eq('business_id', businessId)
  if (error) throw error
  return (data ?? []) as WorkingHour[]
}

export async function updateWorkingHour(id: string, patch: Partial<WorkingHour>): Promise<void> {
  const { error } = await sb().from('working_hours').update(patch).eq('id', id)
  if (error) throw error
}

export async function ensureWorkingHours(businessId: string, existing: WorkingHour[], weekdays: readonly Weekday[]): Promise<WorkingHour[]> {
  const missing = weekdays.filter((d) => !existing.some((e) => e.weekday === d))
  if (missing.length) {
    const rows = missing.map((d) => ({ business_id: businessId, weekday: d, is_open: false }))
    const { error } = await sb().from('working_hours').insert(rows)
    if (error) throw error
  }
  return listWorkingHours(businessId)
}

export async function getBusinessSettings(businessId: string): Promise<BusinessSettings> {
  const { data, error } = await sb().from('business').select('id, default_appointment_duration, slot_interval_minutes, default_buffer_minutes, max_daily_appointments, lunch_break_enabled, lunch_start, lunch_end, currency, language, address, city, postal_code, location_latitude, location_longitude, location_accuracy_meters, location_source, location_captured_at').eq('id', businessId).single()
  if (error) throw error
  return data as BusinessSettings
}

export async function updateBusinessSettings(businessId: string, patch: BusinessSettingsPatch): Promise<void> {
  const { error } = await sb().from('business').update(normalizeBusinessPatch(patch)).eq('id', businessId)
  if (error) throw error
}

export async function listHolidays(businessId: string) {
  const { data, error } = await sb().from('business_holidays').select('*').eq('business_id', businessId).is('deleted_at', null).order('start_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createHoliday(businessId: string, values: any) {
  const { error } = await sb().from('business_holidays').insert({ business_id: businessId, ...values })
  if (error) throw error
}

export async function deleteHoliday(id: string) {
  const { error } = await sb().from('business_holidays').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
