import type { CalendarAppointment } from '@/lib/api/appointments'
import type { AgendaFilters } from './types'

export const AGENDA_PAGE_SIZE = 30

export interface AgendaCursor {
  date: string
  startTime: string
  id: string
}

export interface AgendaPage {
  appointments: CalendarAppointment[]
  nextCursor: AgendaCursor | null
}

export interface AgendaGroup {
  date: string
  appointments: CalendarAppointment[]
}

export function sortAgendaAppointments(
  appointments: CalendarAppointment[],
): CalendarAppointment[] {
  return [...appointments].sort((left, right) => (
    left.appointment_date.localeCompare(right.appointment_date)
    || left.start_time.localeCompare(right.start_time)
    || left.id.localeCompare(right.id)
  ))
}

export function groupAgendaAppointments(
  appointments: CalendarAppointment[],
): AgendaGroup[] {
  const groups: AgendaGroup[] = []
  for (const appointment of sortAgendaAppointments(appointments)) {
    const current = groups.at(-1)
    if (current?.date === appointment.appointment_date) {
      current.appointments.push(appointment)
    } else {
      groups.push({
        date: appointment.appointment_date,
        appointments: [appointment],
      })
    }
  }
  return groups
}

export function agendaNextCursor(
  appointments: CalendarAppointment[],
  pageSize = AGENDA_PAGE_SIZE,
): AgendaCursor | null {
  if (appointments.length < pageSize) return null
  const last = appointments.at(-1)
  return last ? {
    date: last.appointment_date,
    startTime: last.start_time,
    id: last.id,
  } : null
}

export function serializeAgendaFilters(filters: AgendaFilters): string {
  const parameters = new URLSearchParams()
  if (filters.patientId) parameters.set('patientId', filters.patientId)
  if (filters.serviceId) parameters.set('serviceId', filters.serviceId)
  if (filters.status) parameters.set('status', filters.status)
  parameters.sort()
  return parameters.toString()
}
