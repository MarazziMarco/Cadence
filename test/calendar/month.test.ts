import { describe, expect, it } from 'vitest'

import type { CalendarAppointment } from '@/lib/api/appointments'
import { buildMonthCells } from '@/lib/calendar/month'

function appointment(id: string, date: string, startTime: string): CalendarAppointment {
  return {
    id,
    appointment_date: date,
    start_time: startTime,
    end_time: '10:00:00',
    duration_minutes: 30,
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

describe('mobile month cells', () => {
  it('builds a Monday-first six-week grid for July 2026', () => {
    const cells = buildMonthCells({
      month: '2026-07-16',
      today: '2026-07-16',
      selectedDate: '2026-07-20',
      appointments: [],
    })

    expect(cells).toHaveLength(42)
    expect(cells[0]).toMatchObject({
      date: '2026-06-29',
      inMonth: false,
    })
    expect(cells[17]).toMatchObject({
      date: '2026-07-16',
      inMonth: true,
      isToday: true,
    })
    expect(cells[21]).toMatchObject({
      date: '2026-07-20',
      inMonth: true,
      isSelected: true,
    })
    expect(cells.at(-1)).toMatchObject({
      date: '2026-08-09',
      inMonth: false,
    })
  })

  it('sorts appointments and limits each day to two visible indicators', () => {
    const appointments = [
      appointment('e', '2026-07-16', '15:00:00'),
      appointment('b', '2026-07-16', '09:00:00'),
      appointment('d', '2026-07-16', '13:00:00'),
      appointment('a', '2026-07-16', '08:00:00'),
      appointment('c', '2026-07-16', '11:00:00'),
    ]

    const cell = buildMonthCells({
      month: '2026-07-16',
      today: '2026-07-17',
      selectedDate: '2026-07-16',
      appointments,
    }).find((candidate) => candidate.date === '2026-07-16')

    expect(cell?.visibleIndicators.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(cell?.hiddenCount).toBe(3)
  })
})
