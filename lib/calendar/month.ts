import type { CalendarAppointment } from '@/lib/api/appointments'
import { addBusinessDays, monthRange, weekRange } from './date'

export interface MonthCell {
  date: string
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  visibleIndicators: CalendarAppointment[]
  hiddenCount: number
}

export function buildMonthCells({
  month,
  today,
  selectedDate,
  appointments,
}: {
  month: string
  today: string
  selectedDate: string
  appointments: CalendarAppointment[]
}): MonthCell[] {
  const range = monthRange(month)
  const gridStart = weekRange(range.from).from
  const appointmentsByDate = new Map<string, CalendarAppointment[]>()

  for (const appointment of appointments) {
    const existing = appointmentsByDate.get(appointment.appointment_date) ?? []
    existing.push(appointment)
    appointmentsByDate.set(appointment.appointment_date, existing)
  }

  for (const dayAppointments of appointmentsByDate.values()) {
    dayAppointments.sort((left, right) => (
      left.start_time.localeCompare(right.start_time)
      || left.id.localeCompare(right.id)
    ))
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = addBusinessDays(gridStart, index)
    const dayAppointments = appointmentsByDate.get(date) ?? []

    return {
      date,
      inMonth: date >= range.from && date <= range.to,
      isToday: date === today,
      isSelected: date === selectedDate,
      visibleIndicators: dayAppointments.slice(0, 2),
      hiddenCount: Math.max(0, dayAppointments.length - 2),
    }
  })
}
