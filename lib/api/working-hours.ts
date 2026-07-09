import { createClient } from '@/lib/supabase/client'
import type { WorkingHour, Weekday } from '@/lib/types/db'

const sb = () => createClient()

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

export async function getBusinessSettings(businessId: string) {
  const { data, error } = await sb().from('business').select('id, default_appointment_duration, slot_interval_minutes, default_buffer_minutes, max_daily_appointments, lunch_break_enabled, lunch_start, lunch_end').eq('id', businessId).single()
  if (error) throw error
  return data
}

export async function updateBusinessSettings(businessId: string, patch: any): Promise<void> {
  const { error } = await sb().from('business').update(patch).eq('id', businessId)
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
