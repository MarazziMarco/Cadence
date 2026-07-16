import { addBusinessDays, monthRange, weekRange } from './date'
import { clampDensity } from './geometry'
import type { CalendarView, DateRange } from './types'

export const CALENDAR_VIEW_STORAGE_KEY = 'cadence.calendar.view'
export const CALENDAR_DENSITY_STORAGE_KEY = 'cadence.calendar.density'

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
