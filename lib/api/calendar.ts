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

type CalendarMutationFailure = Extract<CalendarMutationResponse, { ok: false }>
type CalendarMutationSuccess = Extract<CalendarMutationResponse, { ok: true }>

export class CalendarMutationError extends Error {
  readonly code: CalendarMutationFailure['code']
  readonly constraints: CalendarConstraint[]
  readonly request: CalendarMutationRequest

  constructor(failure: CalendarMutationFailure, request: CalendarMutationRequest) {
    super(failure.constraints.map((constraint) => constraint.message).join(' ') || failure.code)
    this.name = 'CalendarMutationError'
    this.code = failure.code
    this.constraints = failure.constraints
    this.request = request
  }
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

export async function mutateCalendarOrThrow(
  request: CalendarMutationRequest,
): Promise<CalendarMutationSuccess> {
  const result = await mutateCalendar(request)
  if (result.ok) return result
  throw new CalendarMutationError(result, request)
}

export function isCalendarWarningConfirmation(
  error: unknown,
): error is CalendarMutationError {
  return error instanceof CalendarMutationError && error.code === 'WARNING_CONFIRMATION'
}

export async function confirmCalendarMutation(
  warning: CalendarMutationError,
): Promise<CalendarMutationSuccess> {
  if (warning.code !== 'WARNING_CONFIRMATION') throw warning
  const confirmWarnings = Array.from(new Set(
    warning.constraints
      .filter((constraint) => constraint.level === 'warning')
      .map((constraint) => constraint.code),
  ))
  return mutateCalendarOrThrow({
    ...warning.request,
    idempotencyKey: crypto.randomUUID(),
    confirmWarnings,
  })
}

export async function confirmCalendarMutationInteractively(
  warning: CalendarMutationError,
  confirmUser: (message: string) => boolean = (message) => window.confirm(message),
): Promise<CalendarMutationSuccess | null> {
  if (warning.code !== 'WARNING_CONFIRMATION') throw warning
  const details = warning.constraints
    .map((constraint) => `• ${constraint.message}`)
    .join('\n')
  const accepted = confirmUser(
    `L'appuntamento viola queste preferenze:\n\n${details}\n\nVuoi procedere comunque?`,
  )
  if (!accepted) return null
  return confirmCalendarMutation(warning)
}
