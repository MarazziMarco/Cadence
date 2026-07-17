import { CreateWithClientRequestSchema, toRpcArgs } from '@/lib/calendar/create-with-client-request'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Atomic client + appointment creation. Reuses calendar_validate_mutation inside
// a plpgsql sub-transaction (see migration 202607160007) so a rejected/unconfirmed
// appointment never leaves an orphan client behind.
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

  const parsed = CreateWithClientRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({
      error: 'invalid create-with-client request',
      issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('create_appointment_with_client', toRpcArgs(parsed.data))

  if (error) {
    if (error.message === 'IDEMPOTENCY_KEY_REUSE') {
      return Response.json({ error: 'idempotency key was already used for a different request' }, { status: 409 })
    }
    const status = error.code === '42501' ? 403 : 400
    return Response.json({ error: status === 403 ? 'forbidden' : error.message }, { status })
  }
  return Response.json(data)
}
