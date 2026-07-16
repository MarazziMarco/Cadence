import { z } from 'zod'

import { CALENDAR_CONSTRAINT_CODES } from '@/lib/calendar/constraints'
import {
  APPOINTMENT_LOCATION_MODES,
  type AppointmentLocationMode,
} from '@/lib/types/db'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  )
}, 'Invalid calendar date')

const TimeSchema = z.string().regex(
  /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/,
  'Invalid calendar time',
)

const NullableLocationTextSchema = z.string()
  .trim()
  .max(500)
  .nullable()
  .transform((value) => value === null || value === '' ? null : value)

export interface AppointmentLocationValues {
  location_mode?: AppointmentLocationMode
  location_address?: string | null
  location_city?: string | null
  location_postal_code?: string | null
}

const AppointmentValuesSchema = z.object({
  patient_id: z.string().uuid().optional(),
  service_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(500).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  appointment_date: DateSchema.optional(),
  start_time: TimeSchema.optional(),
  end_time: TimeSchema.optional(),
  duration_minutes: z.number().int().positive().max(1440).optional(),
  price: z.number().finite().nonnegative().nullable().optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  source: z.enum(['manual', 'ai', 'future_customer_portal', 'calendar_import']).optional(),
  confirmed: z.boolean().optional(),
  locked: z.boolean().optional(),
  color: z.string().trim().max(100).nullable().optional(),
  internal_notes: z.string().max(20_000).nullable().optional(),
  location_mode: z.enum(APPOINTMENT_LOCATION_MODES).optional(),
  location_address: NullableLocationTextSchema.optional(),
  location_city: NullableLocationTextSchema.optional(),
  location_postal_code: NullableLocationTextSchema.optional(),
}).strict()

const ALL_VALUE_FIELDS = Object.keys(AppointmentValuesSchema.shape)
const OPERATION_VALUE_FIELDS: Record<string, readonly string[]> = {
  create: ALL_VALUE_FIELDS,
  update: ALL_VALUE_FIELDS,
  move: ['appointment_date', 'start_time', 'end_time'],
  resize: ['duration_minutes', 'end_time'],
  delete: [],
  lock: [],
  unlock: [],
}

export const CalendarMutationRequestSchema = z.object({
  businessId: z.string().uuid(),
  operation: z.enum(['create', 'update', 'move', 'resize', 'delete', 'lock', 'unlock']),
  appointmentId: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().uuid(),
  confirmWarnings: z.array(z.enum(CALENDAR_CONSTRAINT_CODES)).max(20).optional(),
  values: AppointmentValuesSchema,
}).strict().superRefine((body, context) => {
  const targetOperation = body.operation !== 'create'
  if (targetOperation && !body.appointmentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['appointmentId'],
      message: 'Appointment id is required for this operation',
    })
  }
  if (targetOperation && body.expectedVersion === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedVersion'],
      message: 'Expected version is required for this operation',
    })
  }
  if (body.operation === 'create') {
    if (body.appointmentId || body.expectedVersion !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appointmentId'],
        message: 'Create must not target an existing appointment',
      })
    }
    for (const field of ['patient_id', 'appointment_date', 'start_time', 'duration_minutes'] as const) {
      if (body.values[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['values', field],
          message: `${field} is required for create`,
        })
      }
    }
  }
  if (body.operation === 'move') {
    for (const field of ['appointment_date', 'start_time'] as const) {
      if (body.values[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['values', field],
          message: `${field} is required for move`,
        })
      }
    }
  }
  if (body.operation === 'resize' && body.values.duration_minutes === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values', 'duration_minutes'],
      message: 'duration_minutes is required for resize',
    })
  }
  if (
    body.values.location_mode === 'custom'
    && !body.values.location_address
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values', 'location_address'],
      message: 'Custom location requires an address',
    })
  }

  const allowed = new Set(OPERATION_VALUE_FIELDS[body.operation])
  const rejected = Object.keys(body.values).filter((field) => !allowed.has(field))
  if (rejected.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: allowed.size === 0
        ? `${body.operation} does not accept appointment values`
        : `${body.operation} does not accept ${rejected.join(', ')}`,
    })
  }
})

export type ParsedCalendarMutationRequest = z.infer<typeof CalendarMutationRequestSchema>

export function parseCalendarMutationRequest(value: unknown): ParsedCalendarMutationRequest {
  return CalendarMutationRequestSchema.parse(value)
}
