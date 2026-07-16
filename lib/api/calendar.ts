import type { CalendarAppointment } from '@/lib/api/appointments'
import { isCalendarConstraint } from '@/lib/calendar/constraints'
import type { CalendarConstraint } from '@/lib/calendar/types'

export type CalendarMutationOperation =
  | 'create'
  | 'update'
  | 'move'
  | 'resize'
  | 'delete'
  | 'lock'
  | 'unlock'

export interface CalendarMutationRequest {
  businessId: string
  operation: CalendarMutationOperation
  appointmentId?: string
  expectedVersion?: number
  idempotencyKey: string
  confirmWarnings?: string[]
  values: Record<string, unknown>
}

export type CalendarMutationResponse =
  | { ok: true; appointment: CalendarAppointment | null; warnings: CalendarConstraint[] }
  | {
      ok: false
      code: 'HARD_CONSTRAINT' | 'WARNING_CONFIRMATION' | 'STALE_VERSION'
      constraints: CalendarConstraint[]
    }

function isMutationResponse(value: unknown): value is CalendarMutationResponse {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  if (result.ok === true) {
    return (
      (result.appointment === null || typeof result.appointment === 'object')
      && Array.isArray(result.warnings)
      && result.warnings.every(isCalendarConstraint)
    )
  }
  return (
    result.ok === false
    && (
      result.code === 'HARD_CONSTRAINT'
      || result.code === 'WARNING_CONFIRMATION'
      || result.code === 'STALE_VERSION'
    )
    && Array.isArray(result.constraints)
    && result.constraints.every(isCalendarConstraint)
  )
}

export async function mutateCalendar(
  request: CalendarMutationRequest,
): Promise<CalendarMutationResponse> {
  const response = await fetch('/api/calendar/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(response.ok ? 'Invalid calendar mutation response' : 'Calendar mutation failed')
  }

  if (isMutationResponse(body)) return body

  const message = (
    body
    && typeof body === 'object'
    && typeof (body as { error?: unknown }).error === 'string'
  )
    ? (body as { error: string }).error
    : 'Calendar mutation failed'
  throw new Error(message)
}
