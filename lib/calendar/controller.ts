import { addBusinessDays, monthRange, weekRange } from './date'
import { clampDensity } from './geometry'
import type { CalendarView, DateRange } from './types'
import type { CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import { WEEKDAYS } from '@/lib/types/db'

export const CALENDAR_VIEW_STORAGE_KEY = 'cadence.calendar.view'
export const CALENDAR_DENSITY_STORAGE_KEY = 'cadence.calendar.density'

export type ResponsiveCalendarLayout =
  | 'phone'
  | 'three-day'
  | 'seven-day'
  | 'desktop'

export interface DayCapacitySummary {
  date: string
  appointmentCount: number
  bookedMinutes: number
  idleMinutes: number
  gapCount: number
  closed: boolean
}

function minuteOfDay(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function weekdayForDate(date: string) {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  return WEEKDAYS[(day + 6) % 7]
}

export function responsiveCalendarLayout(
  width: number,
  height: number,
  finePointer: boolean,
): ResponsiveCalendarLayout {
  if (finePointer && width >= 1024) return 'desktop'
  if (width >= 1180) return 'seven-day'
  if (width >= 700 || (width > height && width >= 700)) return 'three-day'
  return 'phone'
}

export function summarizeDayCapacity({
  date,
  appointments,
  config,
}: {
  date: string
  appointments: CalendarAppointment[]
  config: CalendarConfig
}): DayCapacitySummary {
  const holidayClosed = config.holidays.some((holiday) => (
    holiday.is_closed
    && holiday.start_date <= date
    && holiday.end_date >= date
  ))
  const hours = config.workingHours.find(
    (workingHour) => workingHour.weekday === weekdayForDate(date),
  )
  const openWindows = hours?.is_open && !holidayClosed
    ? [
        hours.morning_start && hours.morning_end
          ? {
              start: minuteOfDay(hours.morning_start),
              end: minuteOfDay(hours.morning_end),
            }
          : null,
        hours.afternoon_start && hours.afternoon_end
          ? {
              start: minuteOfDay(hours.afternoon_start),
              end: minuteOfDay(hours.afternoon_end),
            }
          : null,
      ].filter(
        (window): window is { start: number; end: number } => (
          window !== null && window.end > window.start
        ),
      )
    : []
  const dayAppointments = appointments
    .filter((appointment) => appointment.appointment_date === date)
    .sort((left, right) => left.start_time.localeCompare(right.start_time))
  const bookedMinutes = dayAppointments.reduce(
    (total, appointment) => total + appointment.duration_minutes,
    0,
  )
  const closed = holidayClosed || !hours?.is_open || openWindows.length === 0
  if (closed || dayAppointments.length < 2) {
    return {
      date,
      appointmentCount: dayAppointments.length,
      bookedMinutes,
      idleMinutes: 0,
      gapCount: 0,
      closed,
    }
  }

  const intervals = dayAppointments.map((appointment) => ({
    start: minuteOfDay(appointment.start_time),
    end: minuteOfDay(appointment.end_time),
  }))
  let idleMinutes = 0
  let gapCount = 0
  for (const window of openWindows) {
    const occupied = intervals
      .map((interval) => ({
        start: Math.max(window.start, interval.start),
        end: Math.min(window.end, interval.end),
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((left, right) => left.start - right.start)
    if (occupied.length < 2) continue
    let cursor = occupied[0].end
    for (const interval of occupied.slice(1)) {
      if (interval.start > cursor) {
        idleMinutes += interval.start - cursor
        gapCount += 1
      }
      cursor = Math.max(cursor, interval.end)
    }
  }

  return {
    date,
    appointmentCount: dayAppointments.length,
    bookedMinutes,
    idleMinutes,
    gapCount,
    closed,
  }
}

export interface CalendarState {
  view: CalendarView
  selectedDate: string
  density: number
  selectedAppointmentId: string | null
  createAt: { date: string; startMinute: number } | null
}

export type CalendarAction =
  | { type: 'select-date'; date: string }
  | { type: 'set-view'; view: CalendarView }
  | { type: 'set-density'; density: number }
  | { type: 'select-appointment'; id: string | null }
  | { type: 'create-at'; value: CalendarState['createAt'] }

function isCalendarView(value: unknown): value is CalendarView {
  return (
    value === 'day' ||
    value === 'week' ||
    value === 'month' ||
    value === 'agenda'
  )
}

function requireCalendarView(value: unknown): CalendarView {
  if (!isCalendarView(value)) {
    throw new RangeError(`Unsupported calendar view: ${String(value)}`)
  }

  return value
}

function requireDateOnly(value: string): string {
  return addBusinessDays(value, 0)
}

function requireMinuteOfDay(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    throw new RangeError(`Invalid minute of day: ${String(value)}`)
  }

  return value
}

function sameCreateAt(
  first: CalendarState['createAt'],
  second: CalendarState['createAt'],
): boolean {
  return (
    first === second ||
    (first !== null &&
      second !== null &&
      first.date === second.date &&
      first.startMinute === second.startMinute)
  )
}

export function calendarReducer(
  state: CalendarState,
  action: CalendarAction,
): CalendarState {
  switch (action.type) {
    case 'select-date': {
      const selectedDate = requireDateOnly(action.date)

      return selectedDate === state.selectedDate
        ? state
        : { ...state, selectedDate }
    }

    case 'set-view': {
      const view = requireCalendarView(action.view)

      return view === state.view ? state : { ...state, view }
    }

    case 'set-density': {
      const density = clampDensity(action.density)

      return density === state.density ? state : { ...state, density }
    }

    case 'select-appointment':
      return action.id === state.selectedAppointmentId
        ? state
        : { ...state, selectedAppointmentId: action.id }

    case 'create-at': {
      const value =
        action.value === null
          ? null
          : {
              date: requireDateOnly(action.value.date),
              startMinute: requireMinuteOfDay(action.value.startMinute),
            }

      return sameCreateAt(value, state.createAt)
        ? state
        : { ...state, createAt: value }
    }

    default:
      throw new RangeError(
        `Unsupported calendar action: ${String((action as { type?: unknown }).type)}`,
      )
  }
}

export function visibleRange(state: CalendarState): DateRange {
  const selectedDate = requireDateOnly(state.selectedDate)

  switch (requireCalendarView(state.view)) {
    case 'day':
      return { from: selectedDate, to: selectedDate }
    case 'week':
      return weekRange(selectedDate)
    case 'month':
      return monthRange(selectedDate)
    case 'agenda':
      return {
        from: selectedDate,
        to: addBusinessDays(selectedDate, 30),
      }
  }
}

export function parseStoredCalendarView(value: string | null): CalendarView | null {
  return isCalendarView(value) ? value : null
}

export function parseStoredCalendarDensity(value: string | null): number | null {
  if (value === null || value.trim() === '') {
    return null
  }

  const density = Number(value)

  return Number.isFinite(density) ? clampDensity(density) : null
}
