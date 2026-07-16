import { describe, expect, it } from 'vitest'

import type { CalendarAppointment } from '@/lib/api/appointments'
import {
  agendaNextCursor,
  groupAgendaAppointments,
  serializeAgendaFilters,
  sortAgendaAppointments,
} from '@/lib/calendar/agenda'

function appointment(
  id: string,
  date: string,
  startTime: string,
): CalendarAppointment {
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

describe('calendar agenda helpers', () => {
  it('orders stably by date, start time, and id and groups sticky days', () => {
    const rows = sortAgendaAppointments([
      appointment('c', '2026-07-17', '09:00:00'),
      appointment('b', '2026-07-16', '10:00:00'),
      appointment('a', '2026-07-16', '10:00:00'),
    ])

    expect(rows.map(({ id }) => id)).toEqual(['a', 'b', 'c'])
    expect(groupAgendaAppointments(rows).map((group) => ({
      date: group.date,
      ids: group.appointments.map(({ id }) => id),
    }))).toEqual([
      { date: '2026-07-16', ids: ['a', 'b'] },
      { date: '2026-07-17', ids: ['c'] },
    ])
  })

  it('uses the last full-page row as an exclusive next cursor', () => {
    const rows = Array.from({ length: 30 }, (_, index) => (
      appointment(
        String(index).padStart(2, '0'),
        '2026-07-16',
        `${String(8 + Math.floor(index / 4)).padStart(2, '0')}:${
          String((index % 4) * 15).padStart(2, '0')
        }:00`,
      )
    ))

    expect(agendaNextCursor(rows)).toEqual({
      date: rows[29].appointment_date,
      startTime: rows[29].start_time,
      id: rows[29].id,
    })
    expect(agendaNextCursor(rows.slice(0, 29))).toBeNull()
  })

  it('serializes filters deterministically and omits empty values', () => {
    expect(serializeAgendaFilters({
      status: 'confirmed',
      patientId: 'patient-1',
      serviceId: undefined,
    })).toBe('patientId=patient-1&status=confirmed')
    expect(serializeAgendaFilters({
      patientId: 'patient-1',
      status: 'confirmed',
    })).toBe('patientId=patient-1&status=confirmed')
  })
})
