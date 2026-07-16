import { describe, expect, it } from 'vitest'

import type { CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  responsiveCalendarLayout,
  summarizeDayCapacity,
} from '@/lib/calendar/controller'

const config: CalendarConfig = {
  timezone: 'Europe/Rome',
  slotIntervalMinutes: 15,
  defaultDurationMinutes: 30,
  maxDailyAppointments: null,
  workingHours: [{
    id: 'wh1',
    business_id: 'business-1',
    weekday: 'thursday',
    is_open: true,
    morning_start: '09:00:00',
    morning_end: '13:00:00',
    afternoon_start: '14:00:00',
    afternoon_end: '18:00:00',
  }],
  holidays: [],
}

function appointment(
  id: string,
  start: string,
  end: string,
  duration: number,
): CalendarAppointment {
  return {
    id,
    appointment_date: '2026-07-16',
    start_time: start,
    end_time: end,
    duration_minutes: duration,
    status: 'scheduled',
    color: null,
    title: null,
    price: null,
    patient_id: `patient-${id}`,
    service_id: null,
    locked: false,
    manual_override: false,
    version: 1,
  }
}

describe('responsive calendar week views', () => {
  it('counts recoverable gaps without counting the lunch closure', () => {
    expect(summarizeDayCapacity({
      date: '2026-07-16',
      appointments: [
        appointment('a', '09:00:00', '10:00:00', 60),
        appointment('b', '11:00:00', '12:00:00', 60),
        appointment('c', '14:00:00', '15:00:00', 60),
      ],
      config,
    })).toEqual({
      date: '2026-07-16',
      appointmentCount: 3,
      bookedMinutes: 180,
      idleMinutes: 60,
      gapCount: 1,
      closed: false,
    })
  })

  it('marks a closed holiday as closed with no recoverable capacity', () => {
    expect(summarizeDayCapacity({
      date: '2026-07-16',
      appointments: [],
      config: {
        ...config,
        holidays: [{
          start_date: '2026-07-16',
          end_date: '2026-07-16',
          is_closed: true,
        }],
      },
    })).toMatchObject({
      closed: true,
      idleMinutes: 0,
      gapCount: 0,
    })
  })

  it('selects phone, three-day, seven-day, and desktop renderers', () => {
    expect(responsiveCalendarLayout(390, 844, false)).toBe('phone')
    expect(responsiveCalendarLayout(844, 390, false)).toBe('three-day')
    expect(responsiveCalendarLayout(820, 1180, false)).toBe('three-day')
    expect(responsiveCalendarLayout(1180, 820, false)).toBe('seven-day')
    expect(responsiveCalendarLayout(1180, 820, true)).toBe('desktop')
  })
})
