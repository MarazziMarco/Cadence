import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GDPR access/portability (art. 15/20): the signed-in user downloads all their
// data as JSON. Read-only, and every query runs through the user's session so
// RLS returns only their own rows.
const TABLES = [
  'profiles', 'business', 'patients', 'appointments', 'services',
  'working_hours', 'business_holidays', 'waiting_list', 'patient_availability',
  'algorithm_settings', 'templates', 'optimization_runs', 'optimization_changes',
] as const

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const dump: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
  }
  for (const table of TABLES) {
    const { data } = await supabase.from(table).select('*')
    dump[table] = data ?? []
  }

  const body = JSON.stringify(dump, null, 2)
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="cadence-data-${user.id}.json"`,
    },
  })
}
