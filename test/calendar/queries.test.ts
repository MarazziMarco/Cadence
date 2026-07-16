import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAppointments } from '@/lib/api/appointments'
import { getCalendarConfig } from '@/lib/api/calendar'
import { calendarKeys } from '@/lib/calendar/query-keys'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111'

describe('calendar query keys', () => {
  it('uses tenant and range values in stable serializable keys', () => {
    expect(calendarKeys.all(BUSINESS_ID)).toEqual(['calendar', BUSINESS_ID])
    expect(calendarKeys.config(BUSINESS_ID)).toEqual(['calendar', BUSINESS_ID, 'config'])
    expect(calendarKeys.range(BUSINESS_ID, '2026-07-01', '2026-07-31')).toEqual([
      'calendar',
      BUSINESS_ID,
      'range',
      '2026-07-01',
      '2026-07-31',
    ])

    const first = calendarKeys.agenda(BUSINESS_ID, {
      serviceId: 'service-1',
      patientId: 'patient-1',
    })
    const second = calendarKeys.agenda(BUSINESS_ID, {
      patientId: 'patient-1',
      serviceId: 'service-1',
      status: undefined,
    })

    expect(first).toEqual(second)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})

describe('calendar appointment range reads', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads all card and constraint fields for only active schedule statuses', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const lte = vi.fn(() => ({ order }))
    const gte = vi.fn(() => ({ lte }))
    const inStatus = vi.fn(() => ({ gte }))
    const is = vi.fn(() => ({ in: inStatus }))
    const eq = vi.fn(() => ({ is }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const { createClient } = await import('@/lib/supabase/client')
    vi.mocked(createClient).mockReturnValue({ from } as never)

    await listAppointments(BUSINESS_ID, '2026-07-01', '2026-07-31')

    expect(select).toHaveBeenCalledWith(expect.stringMatching(/version/))
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/manual_override/))
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/phone/))
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/email/))
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/buffer_before_minutes/))
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/buffer_after_minutes/))
    expect(select).toHaveBeenCalledWith(expect.stringMatching(/max_daily_bookings/))
    expect(inStatus).toHaveBeenCalledWith('status', ['scheduled', 'confirmed'])
  })
})

describe('calendar configuration reads', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('maps business settings, sorts weekdays, and bounds overlapping holidays', async () => {
    const businessSingle = vi.fn().mockResolvedValue({
      data: {
        timezone: 'Europe/Rome',
        slot_interval_minutes: 15,
        default_appointment_duration: 45,
        max_daily_appointments: 9,
      },
      error: null,
    })
    const businessEq = vi.fn(() => ({ single: businessSingle }))
    const businessSelect = vi.fn(() => ({ eq: businessEq }))

    const workingOrder = vi.fn().mockResolvedValue({
      data: [
        { id: 'sun', business_id: BUSINESS_ID, weekday: 'sunday', is_open: false },
        { id: 'mon', business_id: BUSINESS_ID, weekday: 'monday', is_open: true },
      ],
      error: null,
    })
    const workingEq = vi.fn(() => ({ order: workingOrder }))
    const workingSelect = vi.fn(() => ({ eq: workingEq }))

    const holidayGte = vi.fn().mockResolvedValue({
      data: [
        { start_date: '2026-08-15', end_date: '2026-08-15', is_closed: true },
      ],
      error: null,
    })
    const holidayLte = vi.fn(() => ({ gte: holidayGte }))
    const holidayIs = vi.fn(() => ({ lte: holidayLte }))
    const holidayEq = vi.fn(() => ({ is: holidayIs }))
    const holidaySelect = vi.fn(() => ({ eq: holidayEq }))

    const from = vi.fn((table: string) => {
      if (table === 'business') return { select: businessSelect }
      if (table === 'working_hours') return { select: workingSelect }
      if (table === 'business_holidays') return { select: holidaySelect }
      throw new Error(`Unexpected table: ${table}`)
    })
    const { createClient } = await import('@/lib/supabase/client')
    vi.mocked(createClient).mockReturnValue({ from } as never)

    const config = await getCalendarConfig(BUSINESS_ID, {
      from: '2026-07-01',
      to: '2026-09-30',
    })

    expect(holidayLte).toHaveBeenCalledWith('start_date', '2026-09-30')
    expect(holidayGte).toHaveBeenCalledWith('end_date', '2026-07-01')
    expect(config).toEqual({
      timezone: 'Europe/Rome',
      slotIntervalMinutes: 15,
      defaultDurationMinutes: 45,
      maxDailyAppointments: 9,
      workingHours: [
        { id: 'mon', business_id: BUSINESS_ID, weekday: 'monday', is_open: true },
        { id: 'sun', business_id: BUSINESS_ID, weekday: 'sunday', is_open: false },
      ],
      holidays: [
        { start_date: '2026-08-15', end_date: '2026-08-15', is_closed: true },
      ],
    })
  })

  it('keeps the no-range API bounded around the current calendar year', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'))

    const businessSingle = vi.fn().mockResolvedValue({
      data: {
        timezone: 'Europe/Rome',
        slot_interval_minutes: 30,
        default_appointment_duration: 60,
        max_daily_appointments: null,
      },
      error: null,
    })
    const workingOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const holidayGte = vi.fn().mockResolvedValue({ data: [], error: null })
    const holidayLte = vi.fn(() => ({ gte: holidayGte }))
    const from = vi.fn((table: string) => {
      if (table === 'business') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: businessSingle })) })) }
      }
      if (table === 'working_hours') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: workingOrder })) })) }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({ lte: holidayLte })),
          })),
        })),
      }
    })
    const { createClient } = await import('@/lib/supabase/client')
    vi.mocked(createClient).mockReturnValue({ from } as never)

    await getCalendarConfig(BUSINESS_ID)

    expect(holidayLte).toHaveBeenCalledWith('start_date', '2027-12-31')
    expect(holidayGte).toHaveBeenCalledWith('end_date', '2025-01-01')
  })
})
