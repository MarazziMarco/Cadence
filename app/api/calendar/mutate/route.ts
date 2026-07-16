import { z } from 'zod'

import { CALENDAR_CONSTRAINT_CODES } from '@/lib/calendar/constraints'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
}).strict()

const MutationOperationSchema = z.enum([
  'create',
  'update',
  'move',
  'resize',
  'delete',
  'lock',
  'unlock',
])

const CalendarMutationRequestSchema = z.object({
  businessId: z.string().uuid(),
  operation: MutationOperationSchema,
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
    (body.operation === 'delete' || body.operation === 'lock' || body.operation === 'unlock')
    && Object.keys(body.values).length > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: `${body.operation} does not accept appointment values`,
    })
  }
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const parsed = CalendarMutationRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({
      error: 'invalid calendar mutation request',
      issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    }, { status: 400 })
  }

  const body = parsed.data
  const { data, error } = await supabase.rpc('calendar_validate_mutation', {
    p_business_id: body.businessId,
    p_operation: body.operation,
    p_appointment_id: body.appointmentId ?? null,
    p_expected_version: body.expectedVersion ?? null,
    p_idempotency_key: body.idempotencyKey,
    p_values: body.values,
    p_confirm_warnings: body.confirmWarnings ?? [],
  })

  if (error) {
    const status = error.code === '42501' ? 403 : 400
    return Response.json(
      { error: status === 403 ? 'forbidden' : error.message },
      { status },
    )
  }
  return Response.json(data)
}
