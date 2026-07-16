import { describe, expect, it } from 'vitest'

import {
  CALENDAR_DENSITY_STORAGE_KEY,
  CALENDAR_VIEW_STORAGE_KEY,
  calendarReducer,
  parseStoredCalendarDensity,
  parseStoredCalendarView,
  visibleRange,
  type CalendarAction,
  type CalendarState,
} from '@/lib/calendar/controller'

const state: CalendarState = {
  view: 'day',
  selectedDate: '2026-07-16',
  density: 60,
  selectedAppointmentId: null,
  createAt: null,
}

describe('calendarReducer', () => {
  it('selects a date without changing other state', () => {
    const next = calendarReducer(state, {
      type: 'select-date',
      date: '2026-07-17',
    })

    expect(next).toEqual({ ...state, selectedDate: '2026-07-17' })
    expect(state.selectedDate).toBe('2026-07-16')
  })

  it('switches view without losing the selected date', () => {
    const next = calendarReducer(state, { type: 'set-view', view: 'week' })

    expect(next).toEqual({ ...state, view: 'week' })
    expect(next.selectedDate).toBe('2026-07-16')
  })

  it('clamps density through the shared geometry helper', () => {
    expect(
      calendarReducer(state, { type: 'set-density', density: 999 }).density,
    ).toBe(120)
    expect(
      calendarReducer(state, { type: 'set-density', density: -10 }).density,
    ).toBe(36)
  })

  it('selects and clears an appointment', () => {
    const selected = calendarReducer(state, {
      type: 'select-appointment',
      id: 'appointment-1',
    })

    expect(selected).toEqual({
      ...state,
      selectedAppointmentId: 'appointment-1',
    })
    expect(
      calendarReducer(selected, { type: 'select-appointment', id: null }),
    ).toEqual(state)
  })

  it('sets and clears a create-at intent without retaining the action object', () => {
    const value = { date: '2026-07-18', startMinute: 570 }
    const created = calendarReducer(state, { type: 'create-at', value })

    expect(created).toEqual({ ...state, createAt: value })
    expect(created.createAt).not.toBe(value)

    value.startMinute = 600
    expect(created.createAt?.startMinute).toBe(570)
    expect(calendarReducer(created, { type: 'create-at', value: null })).toEqual(
      state,
    )
  })

  it.each([0, 1439])(
    'accepts create-at startMinute boundary %s',
    (startMinute) => {
      expect(
        calendarReducer(state, {
          type: 'create-at',
          value: { date: '2026-07-18', startMinute },
        }).createAt,
      ).toEqual({ date: '2026-07-18', startMinute })
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 1440])(
    'rejects invalid create-at startMinute %s',
    (startMinute) => {
      expect(() =>
        calendarReducer(state, {
          type: 'create-at',
          value: { date: '2026-07-18', startMinute },
        }),
      ).toThrow(RangeError)
    },
  )

  it.each([
    { type: 'select-date', date: '2026-02-30' },
    {
      type: 'create-at',
      value: { date: 'not-a-date', startMinute: 540 },
    },
  ] as CalendarAction[])('rejects invalid action dates', (action) => {
    expect(() => calendarReducer(state, action)).toThrow(RangeError)
  })

  it.each([
    { type: 'select-date', date: state.selectedDate },
    { type: 'set-view', view: state.view },
    { type: 'set-density', density: state.density },
    { type: 'select-appointment', id: state.selectedAppointmentId },
    { type: 'create-at', value: state.createAt },
  ] as CalendarAction[])(
    'returns the same state for semantic no-op action $type',
    (action) => {
      expect(calendarReducer(state, action)).toBe(state)
    },
  )

  it('returns the same state for an equivalent create-at value', () => {
    const withCreateAt: CalendarState = {
      ...state,
      createAt: { date: '2026-07-18', startMinute: 570 },
    }

    expect(
      calendarReducer(withCreateAt, {
        type: 'create-at',
        value: { date: '2026-07-18', startMinute: 570 },
      }),
    ).toBe(withCreateAt)
  })

  it('rejects non-finite density actions', () => {
    expect(() =>
      calendarReducer(state, {
        type: 'set-density',
        density: Number.NaN,
      }),
    ).toThrow(RangeError)
  })

  it('rejects unsupported runtime actions', () => {
    expect(() =>
      calendarReducer(state, { type: 'unsupported' } as never),
    ).toThrow(RangeError)
  })
})

describe('visibleRange', () => {
  it.each([
    ['day', { from: '2026-07-16', to: '2026-07-16' }],
    ['week', { from: '2026-07-13', to: '2026-07-19' }],
    ['month', { from: '2026-07-01', to: '2026-07-31' }],
    ['agenda', { from: '2026-07-16', to: '2026-08-15' }],
  ] as const)('returns the inclusive %s range', (view, expected) => {
    expect(visibleRange({ ...state, view })).toEqual(expected)
  })

  it('rejects invalid selected dates in every view', () => {
    for (const view of ['day', 'week', 'month', 'agenda'] as const) {
      expect(() =>
        visibleRange({ ...state, view, selectedDate: '2026-02-30' }),
      ).toThrow(RangeError)
    }
  })

  it('rejects unsupported runtime views', () => {
    expect(() =>
      visibleRange({ ...state, view: 'unsupported' as never }),
    ).toThrow(RangeError)
  })
})

describe('calendar storage values', () => {
  it('exports stable storage keys', () => {
    expect(CALENDAR_VIEW_STORAGE_KEY).toBe('cadence.calendar.view')
    expect(CALENDAR_DENSITY_STORAGE_KEY).toBe('cadence.calendar.density')
  })

  it.each(['day', 'week', 'month', 'agenda'] as const)(
    'parses stored view %s',
    (view) => {
      expect(parseStoredCalendarView(view)).toBe(view)
    },
  )

  it.each([null, '', ' week ', 'year', 'null'])(
    'rejects invalid stored view %s',
    (value) => {
      expect(parseStoredCalendarView(value)).toBeNull()
    },
  )

  it('parses and clamps finite stored density', () => {
    expect(parseStoredCalendarDensity('60')).toBe(60)
    expect(parseStoredCalendarDensity('999')).toBe(120)
    expect(parseStoredCalendarDensity('-10')).toBe(36)
  })

  it.each([null, '', ' ', 'not-a-number', 'Infinity', 'NaN'])(
    'rejects invalid stored density %s',
    (value) => {
      expect(parseStoredCalendarDensity(value)).toBeNull()
    },
  )
})
