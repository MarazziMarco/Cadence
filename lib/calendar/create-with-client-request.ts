import { z } from 'zod'

// Request contract for POST /api/calendar/create-with-client — atomically create
// (or reuse) a client and their appointment. Mirrors the appointment field rules
// used by the standard calendar mutation endpoint.

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const TimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'Invalid time')
const NullableText = z.string().trim().max(500).nullable().optional()

const PostalAddressSchema = z.object({
  address: NullableText,
  city: NullableText,
  postalCode: NullableText,
})

const NewPatientSchema = z.object({
  firstName: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200).nullable().optional(),
}).merge(PostalAddressSchema)

const ExistingPatientSchema = z.object({
  id: z.string().uuid(),
}).merge(PostalAddressSchema.partial())

const AppointmentValuesSchema = z.object({
  service_id: z.string().uuid().nullable().optional(),
  appointment_date: DateSchema,
  start_time: TimeSchema,
  end_time: TimeSchema.optional(),
  duration_minutes: z.number().int().positive().max(1440),
  price: z.number().finite().nonnegative().nullable().optional(),
  title: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(100).nullable().optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  source: z.enum(['manual', 'ai', 'future_customer_portal', 'calendar_import']).optional(),
  location_mode: z.enum(['inherit', 'studio', 'patient', 'custom']).optional(),
  location_address: NullableText,
  location_city: NullableText,
  location_postal_code: NullableText,
}).strict()

export const CreateWithClientRequestSchema = z.object({
  businessId: z.string().uuid(),
  patient: z.union([ExistingPatientSchema, NewPatientSchema]),
  appointment: AppointmentValuesSchema,
  idempotencyKey: z.string().min(1).max(200),
  confirmWarnings: z.array(z.string()).optional(),
}).strict()

export type CreateWithClientRequest = z.infer<typeof CreateWithClientRequestSchema>

// Shape the validated request into the arguments the plpgsql RPC expects.
export function toRpcArgs(body: CreateWithClientRequest) {
  const p = body.patient as Record<string, unknown>
  const patient = 'id' in p && p.id
    ? { id: p.id, ...(p.address !== undefined ? { address: p.address, city: p.city, postal_code: p.postalCode } : {}) }
    : {
        first_name: (p as any).firstName,
        last_name: (p as any).lastName ?? null,
        address: (p as any).address ?? null,
        city: (p as any).city ?? null,
        postal_code: (p as any).postalCode ?? null,
      }
  return {
    p_business_id: body.businessId,
    p_patient: patient,
    p_values: { status: 'scheduled', source: 'manual', ...body.appointment },
    p_idempotency_key: body.idempotencyKey,
    p_confirm_warnings: body.confirmWarnings ?? [],
  }
}
