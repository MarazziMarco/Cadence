export type CalendarView = 'day' | 'week' | 'month' | 'agenda'
export type DateRange = { from: string; to: string }
export type WeekBucket = DateRange & { key: string }
export type CalendarDensity = number
export type ConstraintLevel = 'hard' | 'warning'

export interface AgendaFilters {
  patientId?: string
  serviceId?: string
  status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
}

export interface MoveIntent {
  appointmentId: string
  expectedVersion: number
  date: string
  startMinute: number
}

export interface ResizeIntent {
  appointmentId: string
  expectedVersion: number
  durationMinutes: number
}

export interface CalendarConstraint {
  code: string
  level: ConstraintLevel
  message: string
}
