import {
  contextualOptimizationRanges,
  validateContextualOptimization,
  type ContextualOptimizationInput,
} from '@/lib/calendar/contextual-optimization'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    || !['day', 'week', 'month', 'custom'].includes(String(body.scope))
    || typeof body.dateFrom !== 'string'
    || typeof body.dateTo !== 'string'
    || typeof body.allowCrossWeek !== 'boolean'
    || typeof body.maxCrossWeekDays !== 'number'
  ) {
    return Response.json({ error: 'invalid contextual optimization request' }, {
      status: 400,
    })
  }
  const input: ContextualOptimizationInput = {
    scope: body.scope as ContextualOptimizationInput['scope'],
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    allowCrossWeek: body.allowCrossWeek,
    maxCrossWeekDays: body.maxCrossWeekDays,
  }
  const validationError = validateContextualOptimization(input)
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 })
  }

  const { data: business } = await supabase
    .from('business')
    .select('id')
    .eq('id', body.businessId)
    .eq('profile_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!business) return Response.json({ error: 'forbidden' }, { status: 403 })

  const batchId = crypto.randomUUID()
  const ranges = contextualOptimizationRanges(input)
  const runs = await Promise.all(ranges.map(async (range) => {
    const { data, error } = await supabase.functions.invoke(
      'optimize-schedule',
      {
        body: {
          business_id: body.businessId,
          date_from: range.from,
          date_to: range.to,
          batch_id: batchId,
          scope_kind: input.scope,
          week_key: range.weekKey,
          allow_cross_week: input.allowCrossWeek,
          max_cross_week_days: input.maxCrossWeekDays,
        },
      },
    )
    if (error) throw error
    if (!data?.run_id) throw new Error('No run_id returned')
    return {
      runId: data.run_id as string,
      weekKey: range.weekKey,
      from: range.from,
      to: range.to,
    }
  })).catch((error) => error)

  if (runs instanceof Error) {
    return Response.json({ error: runs.message }, { status: 400 })
  }
  return Response.json({ batchId, runs })
}
