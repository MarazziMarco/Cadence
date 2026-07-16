import type { AgendaFilters } from '@/lib/calendar/types'

function stableAgendaFilters(filters: AgendaFilters): AgendaFilters {
  const stable: AgendaFilters = {}
  if (filters.patientId !== undefined) stable.patientId = filters.patientId
  if (filters.serviceId !== undefined) stable.serviceId = filters.serviceId
  if (filters.status !== undefined) stable.status = filters.status
  return stable
}

export const calendarKeys = {
  all: (businessId: string) => ['calendar', businessId] as const,
  config: (businessId: string) => ['calendar', businessId, 'config'] as const,
  range: (businessId: string, from: string, to: string) =>
    ['calendar', businessId, 'range', from, to] as const,
  agenda: (businessId: string, filters: AgendaFilters) =>
    ['calendar', businessId, 'agenda', stableAgendaFilters(filters)] as const,
}
