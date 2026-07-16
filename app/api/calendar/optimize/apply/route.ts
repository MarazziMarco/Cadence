import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function uuidArray(value: unknown): value is string[] {
  return (
    Array.isArray(value)
    && value.length > 0
    && value.every((item) => typeof item === 'string' && item.length > 0)
  )
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (
    typeof body.businessId !== 'string'
    || typeof body.idempotencyKey !== 'string'
  ) {
    return Response.json({ error: 'invalid optimization request' }, { status: 400 })
  }

  const isUndo = body.action === 'undo'
  if (
    (isUndo && typeof body.runId !== 'string')
    || (!isUndo && (
      !uuidArray(body.runIds)
      || !Array.isArray(body.selectedChangeIds)
      || !body.selectedChangeIds.every((id) => typeof id === 'string')
    ))
  ) {
    return Response.json({ error: 'invalid optimization request' }, { status: 400 })
  }

  const { data, error } = isUndo
    ? await supabase.rpc('undo_optimization_run', {
        p_business_id: body.businessId,
        p_run_id: body.runId,
        p_idempotency_key: body.idempotencyKey,
      })
    : await supabase.rpc('apply_optimization_batch', {
        p_business_id: body.businessId,
        p_run_ids: body.runIds,
        p_selected_change_ids: body.selectedChangeIds,
        p_idempotency_key: body.idempotencyKey,
      })

  if (error) {
    const status = error.code === '42501'
      ? 403
      : /STALE|CONFLICT|OVERLAP/i.test(error.message)
        ? 409
        : 400
    return Response.json({
      error: status === 403 ? 'forbidden' : error.message,
    }, { status })
  }
  return Response.json(data)
}
