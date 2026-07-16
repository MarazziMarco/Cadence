import { CalendarMutationRequestSchema } from '@/lib/calendar/mutation-request'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    if (error.message === 'IDEMPOTENCY_KEY_REUSE') {
      return Response.json(
        { error: 'idempotency key was already used for a different request' },
        { status: 409 },
      )
    }
    const status = error.code === '42501' ? 403 : 400
    return Response.json(
      { error: status === 403 ? 'forbidden' : error.message },
      { status },
    )
  }
  return Response.json(data)
}
