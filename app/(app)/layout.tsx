import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, display_name, first_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.onboarding_completed) redirect('/onboarding')

  const name = profile?.display_name || profile?.first_name || (user.user_metadata?.full_name as string) || undefined
  return <AppShell user={{ email: user.email || '', name }}>{children}</AppShell>
}
