import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GDPR erasure (art. 17): hard-delete all data owned by the signed-in user, then
// their auth account. Irreversible. The RPC enforces ownership via auth.uid();
// the auth user is removed with the Admin API (service-role, server-only).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  // 1. Delete all owned data (runs as the user; RPC checks ownership).
  const { error: rpcError } = await supabase.rpc('delete_account')
  if (rpcError) {
    return Response.json({ error: rpcError.message }, { status: 400 })
  }

  // 2. Delete the auth user (service-role).
  try {
    const admin = createAdminClient()
    const { error: adminError } = await admin.auth.admin.deleteUser(user.id)
    if (adminError) {
      return Response.json({ ok: true, authDeleted: false, warning: adminError.message })
    }
  } catch {
    return Response.json({ ok: true, authDeleted: false })
  }

  await supabase.auth.signOut()
  return Response.json({ ok: true })
}
