import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, first_name, last_name, display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.onboarding_completed) redirect('/dashboard')

  const metaName = (user.user_metadata?.full_name as string) || ''
  const defaultFirst = profile?.first_name || metaName.split(' ')[0] || ''
  const defaultLast = profile?.last_name || metaName.split(' ').slice(1).join(' ') || ''

  return <OnboardingWizard defaultFirstName={defaultFirst} defaultLastName={defaultLast} />
}
