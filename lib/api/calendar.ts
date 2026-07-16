import type { CalendarAppointment } from '@/lib/api/appointments'
import { isCalendarConstraint } from '@/lib/calendar/constraints'
import type {
  AgendaFilters,
  CalendarConstraint,
  MoveIntent,
  ResizeIntent,
} from '@/lib/calendar/types'
import {
  AGENDA_PAGE_SIZE,
  agendaNextCursor,
  sortAgendaAppointments,
  type AgendaCursor,
  type AgendaPage,
} from '@/lib/calendar/agenda'
import { createClient } from '@/lib/supabase/client'
import { WEEKDAYS, type WorkingHour } from '@/lib/types/db'

export interface CalendarConfig {
  timezone: string
  slotIntervalMinutes: number
  defaultDurationMinutes: number
  maxDailyAppointments: number | null
  workingHours: WorkingHour[]
  holidays: Array<{ start_date: string; end_date: string; is_closed: boolean }>
}

const AGENDA_SELECT = 'id, appointment_date, start_time, end_time, duration_minutes, status, color, title, price, patient_id, service_id, locked, manual_override, version, patients:patient_id ( first_name, last_name, full_name, color, phone, email ), services:service_id ( name, color, buffer_before_minutes, buffer_after_minutes, max_daily_bookings )'

export async function listAgendaPage(
  businessId: string,
  startDate: string,
  filters: AgendaFilters,
  cursor: AgendaCursor | null,
): Promise<AgendaPage> {
  const supabase = createClient()
  let query = supabase
    .from('appointments')
    .select(AGENDA_SELECT)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('appointment_date', startDate)

  if (filters.patientId) query = query.eq('patient_id', filters.patientId)
  if (filters.serviceId) query = query.eq('service_id', filters.serviceId)
  if (filters.status) query = query.eq('status', filters.status)
  if (cursor) {
    query = query.or(
      `appointment_date.gt.${cursor.date},and(appointment_date.eq.${cursor.date},start_time.gt.${cursor.startTime}),and(appointment_date.eq.${cursor.date},start_time.eq.${cursor.startTime},id.gt.${cursor.id})`,
    )
  }

  const { data, error } = await query
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true })
    .order('id', { ascending: true })
    .limit(AGENDA_PAGE_SIZE)
  if (error) throw error

  const appointments = sortAgendaAppointments(
    (data ?? []) as unknown as CalendarAppointment[],
  )
  return {
    appointments,
    nextCursor: agendaNextCursor(appointments),
  }
}

/**
 * Loads the complete client calendar configuration. Holidays are intentionally
 * range-independent so the stable config query key remains correct while users
 * navigate to any month.
 */
export async function getCalendarConfig(businessId: string): Promise<CalendarConfig> {
  const supabase = createClient()

  const [businessResult, workingHoursResult, holidaysResult] = await Promise.all([
    supabase
      .from('business')
      .select('timezone, slot_interval_minutes, default_appointment_duration, max_daily_appointments')
      .eq('id', businessId)
      .single(),
    supabase
      .from('working_hours')
      .select('id, business_id, weekday, is_open, morning_start, morning_end, afternoon_start, afternoon_end')
      .eq('business_id', businessId)
      .order('weekday', { ascending: true }),
    supabase
      .from('business_holidays')
      .select('start_date, end_date, is_closed')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .eq('affects_scheduler', true)
      .order('start_date', { ascending: true })
      .order('end_date', { ascending: true }),
  ])

  if (businessResult.error) throw businessResult.error
  if (workingHoursResult.error) throw workingHoursResult.error
  if (holidaysResult.error) throw holidaysResult.error
  if (!businessResult.data) throw new Error('Calendar business configuration not found')

  const weekdayOrder = new Map(WEEKDAYS.map((weekday, index) => [weekday, index]))
  const workingHours = [...(workingHoursResult.data ?? [])]
    .sort((left, right) => (
      (weekdayOrder.get(left.weekday as WorkingHour['weekday']) ?? WEEKDAYS.length)
      - (weekdayOrder.get(right.weekday as WorkingHour['weekday']) ?? WEEKDAYS.length)
    )) as WorkingHour[]
  const holidays = [...(holidaysResult.data ?? [])]
    .sort((left, right) => (
      left.start_date.localeCompare(right.start_date)
      || left.end_date.localeCompare(right.end_date)
    )) as Array<{
      start_date: string
      end_date: string
      is_closed: boolean
    }>

  return {
    timezone: businessResult.data.timezone,
    slotIntervalMinutes: businessResult.data.slot_interval_minutes,
    defaultDurationMinutes: businessResult.data.default_appointment_duration,
    maxDailyAppointments: businessResult.data.max_daily_appointments,
    workingHours,
    holidays: holidays.map((holiday) => ({
      start_date: holiday.start_date,
      end_date: holiday.end_date,
      is_closed: holiday.is_closed,
    })),
  }
}

export type CalendarMutationOperation =
  | 'create'
  | 'update'
  | 'move'
  | 'resize'
  | 'delete'
  | 'lock'
  | 'unlock'

export interface CalendarMutationRequest {
  businessId: string
  operation: CalendarMutationOperation
  appointmentId?: string
  expectedVersion?: number
  idempotencyKey: string
  confirmWarnings?: string[]
  values: Record<string, unknown>
}

export type CalendarAppointmentChange =
  | { kind: 'move'; request: MoveIntent }
  | { kind: 'resize'; request: ResizeIntent }

function appointmentTimeToMinute(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function appointmentMinuteToTime(minute: number) {
  const hour = Math.floor(minute / 60)
  const value = minute % 60
  return `${String(hour).padStart(2, '0')}:${
    String(value).padStart(2, '0')
  }:00`
}

export type CalendarMutationResponse =
  | { ok: true; appointment: CalendarAppointment | null; warnings: CalendarConstraint[] }
  | {
      ok: false
      code: 'HARD_CONSTRAINT' | 'WARNING_CONFIRMATION' | 'STALE_VERSION'
      constraints: CalendarConstraint[]
    }

type CalendarMutationFailure = Extract<CalendarMutationResponse, { ok: false }>
type CalendarMutationSuccess = Extract<CalendarMutationResponse, { ok: true }>

export class CalendarMutationError extends Error {
  readonly code: CalendarMutationFailure['code']
  readonly constraints: CalendarConstraint[]
  readonly request: CalendarMutationRequest

  constructor(failure: CalendarMutationFailure, request: CalendarMutationRequest) {
    super(failure.constraints.map((constraint) => constraint.message).join(' ') || failure.code)
    this.name = 'CalendarMutationError'
    this.code = failure.code
    this.constraints = failure.constraints
    this.request = request
  }
}

function isMutationResponse(value: unknown): value is CalendarMutationResponse {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  if (result.ok === true) {
    return (
      (result.appointment === null || typeof result.appointment === 'object')
      && Array.isArray(result.warnings)
      && result.warnings.every(isCalendarConstraint)
    )
  }
  return (
    result.ok === false
    && (
      result.code === 'HARD_CONSTRAINT'
      || result.code === 'WARNING_CONFIRMATION'
      || result.code === 'STALE_VERSION'
    )
    && Array.isArray(result.constraints)
    && result.constraints.every(isCalendarConstraint)
  )
}

export async function mutateCalendar(
  request: CalendarMutationRequest,
): Promise<CalendarMutationResponse> {
  const response = await fetch('/api/calendar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(response.ok ? 'Invalid calendar mutation response' : 'Calendar mutation failed')
  }

  if (isMutationResponse(body)) return body

  const message = (
    body
    && typeof body === 'object'
    && typeof (body as { error?: unknown }).error === 'string'
  )
    ? (body as { error: string }).error
    : 'Calendar mutation failed'
  throw new Error(message)
}

export function optimisticCalendarAppointment(
  appointment: CalendarAppointment,
  change: CalendarAppointmentChange,
): CalendarAppointment {
  if (change.kind === 'move') {
    return {
      ...appointment,
      appointment_date: change.request.date,
      start_time: appointmentMinuteToTime(change.request.startMinute),
      end_time: appointmentMinuteToTime(
        change.request.startMinute + appointment.duration_minutes,
      ),
    }
  }

  const startMinute = appointmentTimeToMinute(appointment.start_time)
  return {
    ...appointment,
    duration_minutes: change.request.durationMinutes,
    end_time: appointmentMinuteToTime(
      startMinute + change.request.durationMinutes,
    ),
  }
}

export function calendarChangeRequest(
  businessId: string,
  appointment: CalendarAppointment,
  change: CalendarAppointmentChange,
): CalendarMutationRequest {
  const optimistic = optimisticCalendarAppointment(appointment, change)
  return change.kind === 'move'
    ? {
        businessId,
        operation: 'move',
        appointmentId: appointment.id,
        expectedVersion: change.request.expectedVersion,
        idempotencyKey: crypto.randomUUID(),
        values: {
          appointment_date: optimistic.appointment_date,
          start_time: optimistic.start_time,
          end_time: optimistic.end_time,
        },
      }
    : {
        businessId,
        operation: 'resize',
        appointmentId: appointment.id,
        expectedVersion: change.request.expectedVersion,
        idempotencyKey: crypto.randomUUID(),
        values: {
          duration_minutes: optimistic.duration_minutes,
          end_time: optimistic.end_time,
        },
      }
}

export function undoCalendarChangeRequest(
  businessId: string,
  before: CalendarAppointment,
  current: CalendarAppointment,
  kind: CalendarAppointmentChange['kind'],
): CalendarMutationRequest {
  return kind === 'move'
    ? {
        businessId,
        operation: 'move',
        appointmentId: current.id,
        expectedVersion: current.version,
        idempotencyKey: crypto.randomUUID(),
        values: {
          appointment_date: before.appointment_date,
          start_time: before.start_time,
          end_time: before.end_time,
        },
      }
    : {
        businessId,
        operation: 'resize',
        appointmentId: current.id,
        expectedVersion: current.version,
        idempotencyKey: crypto.randomUUID(),
        values: {
          duration_minutes: before.duration_minutes,
          end_time: before.end_time,
        },
      }
}

export async function mutateCalendarOrThrow(
  request: CalendarMutationRequest,
): Promise<CalendarMutationSuccess> {
  const result = await mutateCalendar(request)
  if (result.ok) return result
  throw new CalendarMutationError(result, request)
}

export function isCalendarWarningConfirmation(
  error: unknown,
): error is CalendarMutationError {
  return error instanceof CalendarMutationError && error.code === 'WARNING_CONFIRMATION'
}

export async function confirmCalendarMutation(
  warning: CalendarMutationError,
): Promise<CalendarMutationSuccess> {
  if (warning.code !== 'WARNING_CONFIRMATION') throw warning
  const confirmWarnings = Array.from(new Set(
    warning.constraints
      .filter((constraint) => constraint.level === 'warning')
      .map((constraint) => constraint.code),
  ))
  return mutateCalendarOrThrow({
    ...warning.request,
    idempotencyKey: crypto.randomUUID(),
    confirmWarnings,
  })
}

export async function confirmCalendarMutationInteractively(
  warning: CalendarMutationError,
  confirmUser: (message: string) => boolean = (message) => window.confirm(message),
): Promise<CalendarMutationSuccess | null> {
  if (warning.code !== 'WARNING_CONFIRMATION') throw warning
  const details = warning.constraints
    .map((constraint) => `• ${constraint.message}`)
    .join('\n')
  const accepted = confirmUser(
    `L'appuntamento viola queste preferenze:\n\n${details}\n\nVuoi procedere comunque?`,
  )
  if (!accepted) return null
  return confirmCalendarMutation(warning)
}
