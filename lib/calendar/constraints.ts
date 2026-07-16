import type { CalendarConstraint } from '@/lib/calendar/types'

export const CALENDAR_CONSTRAINT_CODES = [
  'OVERLAP',
  'LOCKED',
  'CLOSED_DAY',
  'HOLIDAY',
  'OUTSIDE_WORKING_HOURS',
  'INVALID_DURATION',
  'SERVICE_DAILY_LIMIT',
  'PATIENT_WEEKDAY_PREFERENCE',
  'PATIENT_TIME_PREFERENCE',
  'BUSINESS_DAILY_TARGET',
  'STALE_VERSION',
] as const

export type CalendarConstraintCode = (typeof CALENDAR_CONSTRAINT_CODES)[number]

export function isCalendarConstraint(value: unknown): value is CalendarConstraint {
  if (!value || typeof value !== 'object') return false
  const constraint = value as Partial<CalendarConstraint>
  return (
    typeof constraint.code === 'string'
    && (constraint.level === 'hard' || constraint.level === 'warning')
    && typeof constraint.message === 'string'
  )
}
