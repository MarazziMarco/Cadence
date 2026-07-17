import { createClient } from '@/lib/supabase/client'
import {
  WEEKDAYS,
  type Patient,
  type PatientAvailability,
  type Weekday,
  type WorkingHour,
} from '@/lib/types/db'

const sb = () => createClient()

const PERIOD_WINDOW: Record<'morning' | 'afternoon', [string, string]> = {
  morning: ['09:00:00', '13:00:00'],
  afternoon: ['14:00:00', '18:00:00'],
}

const FULL_DAY_WINDOW: [string, string] = ['00:00:00', '24:00:00']

export const DAY_AVAILABILITY_STATES = [
  'unavailable',
  'all_day',
  'morning_only',
  'afternoon_only',
  'prefer_morning',
  'prefer_afternoon',
] as const

export type DayAvailabilityState = (typeof DAY_AVAILABILITY_STATES)[number]
export type WeeklyAvailability = Record<Weekday, DayAvailabilityState>
export type WeeklyAvailabilityPatch = Partial<WeeklyAvailability>

export type RecurringAvailabilityRow = Pick<
  PatientAvailability,
  | 'patient_id'
  | 'weekday'
  | 'start_time'
  | 'end_time'
  | 'priority'
  | 'is_available'
  | 'valid_from'
  | 'valid_until'
  | 'recurring'
>

export type PatientFilter = 'all' | 'vip' | 'archived'

function normalizeTime(value: string) {
  const [hours = '00', minutes = '00', seconds = '00'] = value.split(':')
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`
}

function validWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): [string, string] | null {
  if (!start || !end) return null
  const normalizedStart = normalizeTime(start)
  const normalizedEnd = normalizeTime(end)
  return normalizedStart < normalizedEnd
    ? [normalizedStart, normalizedEnd]
    : null
}

function windowsForWeekday(
  weekday: Weekday,
  workingHours: WorkingHour[],
) {
  const configured = workingHours.find((row) => row.weekday === weekday)
  return {
    morning: validWindow(
      configured?.morning_start,
      configured?.morning_end,
    ) ?? PERIOD_WINDOW.morning,
    afternoon: validWindow(
      configured?.afternoon_start,
      configured?.afternoon_end,
    ) ?? PERIOD_WINDOW.afternoon,
  }
}

export function createDefaultWeeklyAvailability(): WeeklyAvailability {
  return Object.fromEntries(
    WEEKDAYS.map((weekday) => [weekday, 'all_day']),
  ) as WeeklyAvailability
}

function availabilityRow(
  patientId: string,
  weekday: Weekday,
  window: [string, string],
  priority: 'normal' | 'high',
  isAvailable = true,
): RecurringAvailabilityRow {
  return {
    patient_id: patientId,
    weekday,
    start_time: window[0],
    end_time: window[1],
    priority,
    is_available: isAvailable,
    valid_from: null,
    valid_until: null,
    recurring: true,
  }
}

export function availabilityRowsForWeekly(
  patientId: string,
  weekly: WeeklyAvailability,
  workingHours: WorkingHour[],
): RecurringAvailabilityRow[] {
  return WEEKDAYS.flatMap((weekday) => {
    const state = weekly[weekday]
    const windows = windowsForWeekday(weekday, workingHours)
    if (state === 'unavailable') {
      return [
        availabilityRow(
          patientId,
          weekday,
          FULL_DAY_WINDOW,
          'normal',
          false,
        ),
      ]
    }
    if (state === 'morning_only') {
      return [availabilityRow(patientId, weekday, windows.morning, 'normal')]
    }
    if (state === 'afternoon_only') {
      return [availabilityRow(patientId, weekday, windows.afternoon, 'normal')]
    }
    if (state === 'prefer_morning') {
      return [
        availabilityRow(patientId, weekday, FULL_DAY_WINDOW, 'normal'),
        availabilityRow(patientId, weekday, windows.morning, 'high'),
      ]
    }
    if (state === 'prefer_afternoon') {
      return [
        availabilityRow(patientId, weekday, FULL_DAY_WINDOW, 'normal'),
        availabilityRow(patientId, weekday, windows.afternoon, 'high'),
      ]
    }
    return [availabilityRow(patientId, weekday, FULL_DAY_WINDOW, 'normal')]
  })
}

function windowKey(start: string, end: string) {
  return `${normalizeTime(start)}-${normalizeTime(end)}`
}

export function weeklyAvailabilityFromRows(
  rows: RecurringAvailabilityRow[],
  workingHours: WorkingHour[],
): WeeklyAvailability {
  const weekly = createDefaultWeeklyAvailability()
  for (const weekday of WEEKDAYS) {
    const dayRows = rows.filter((row) => (
      row.weekday === weekday && row.recurring
    ))
    if (dayRows.length === 0) continue
    if (dayRows.some((row) => row.is_available === false)) {
      weekly[weekday] = 'unavailable'
      continue
    }

    const windows = windowsForWeekday(weekday, workingHours)
    const morningKey = windowKey(...windows.morning)
    const afternoonKey = windowKey(...windows.afternoon)
    const fullDayKey = windowKey(...FULL_DAY_WINDOW)
    const normalKeys = new Set(
      dayRows
        .filter((row) => row.is_available && row.priority === 'normal')
        .map((row) => windowKey(row.start_time, row.end_time)),
    )
    const highKeys = new Set(
      dayRows
        .filter((row) => row.is_available && row.priority === 'high')
        .map((row) => windowKey(row.start_time, row.end_time)),
    )
    const hasMorning = normalKeys.has(morningKey)
    const hasAfternoon = normalKeys.has(afternoonKey)
    const hasFullDay = normalKeys.has(fullDayKey)

    if (hasFullDay && highKeys.has(morningKey)) {
      weekly[weekday] = 'prefer_morning'
    } else if (hasFullDay && highKeys.has(afternoonKey)) {
      weekly[weekday] = 'prefer_afternoon'
    } else if (hasFullDay) {
      weekly[weekday] = 'all_day'
    } else if (hasMorning && !hasAfternoon) {
      weekly[weekday] = 'morning_only'
    } else if (!hasMorning && hasAfternoon) {
      weekly[weekday] = 'afternoon_only'
    } else if (hasMorning && hasAfternoon && highKeys.has(morningKey)) {
      weekly[weekday] = 'prefer_morning'
    } else if (hasMorning && hasAfternoon && highKeys.has(afternoonKey)) {
      weekly[weekday] = 'prefer_afternoon'
    } else {
      weekly[weekday] = 'all_day'
    }
  }
  return weekly
}

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
  for (const key of ['address', 'city', 'postal_code'] as const) {
    if (key in rest && typeof rest[key] === 'string') {
      rest[key] = rest[key].trim() || null
    }
  }
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

export async function getPatientWeeklyAvailability(
  patientId: string,
  workingHours: WorkingHour[],
): Promise<WeeklyAvailability> {
  const { data, error } = await sb()
    .from('patient_availability')
    .select('patient_id, weekday, start_time, end_time, priority, is_available, valid_from, valid_until, recurring')
    .eq('patient_id', patientId)
    .eq('recurring', true)
    .is('deleted_at', null)
  if (error) throw error
  return weeklyAvailabilityFromRows(
    (data ?? []) as RecurringAvailabilityRow[],
    workingHours,
  )
}

export async function replacePatientWeeklyAvailability(
  patientId: string,
  weekly: WeeklyAvailability,
  workingHours: WorkingHour[],
): Promise<void> {
  const rows = availabilityRowsForWeekly(patientId, weekly, workingHours)
    .map(({ patient_id: _patientId, ...row }) => row)
  await replacePatientRecurringRows(patientId, rows)
}

async function replacePatientRecurringRows(
  patientId: string,
  rows: Omit<RecurringAvailabilityRow, 'patient_id'>[],
): Promise<void> {
  const { error } = await sb().rpc('replace_patient_weekly_availability', {
    p_patient_id: patientId,
    p_rows: rows,
  })
  if (error) throw error
}

export async function mergePatientWeeklyAvailability(
  patientId: string,
  patch: WeeklyAvailabilityPatch,
  workingHours: WorkingHour[],
): Promise<void> {
  const current = await getPatientWeeklyAvailability(patientId, workingHours)
  await replacePatientWeeklyAvailability(
    patientId,
    { ...current, ...patch },
    workingHours,
  )
}

/**
 * Replaces a patient's recurring weekday availability. When set, the optimizer
 * only places this patient on the given weekdays (any time of day). Passing an
 * empty list clears the constraint (patient becomes flexible again). Uses the
 * existing patient_availability table — no schema change.
 */
export async function setPatientWeekdayAvailability(patientId: string, weekdays: Weekday[], preferred: 'morning' | 'afternoon' | null = null): Promise<void> {
  if (weekdays.length === 0 && !preferred) {
    await replacePatientRecurringRows(patientId, [])
    return
  }

  const allowed = new Set(weekdays.length ? weekdays : WEEKDAYS)
  const preferredState = preferred === 'morning'
    ? 'prefer_morning'
    : preferred === 'afternoon'
      ? 'prefer_afternoon'
      : 'all_day'
  const weekly = Object.fromEntries(
    WEEKDAYS.map((weekday) => [
      weekday,
      allowed.has(weekday) ? preferredState : 'unavailable',
    ]),
  ) as WeeklyAvailability
  await replacePatientWeeklyAvailability(patientId, weekly, [])
}
