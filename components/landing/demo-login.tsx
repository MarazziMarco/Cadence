'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, LogIn } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

// One-click "full demo": resets the shared demo account to fresh fake data, then
// logs in as it. Anyone can also log in manually with the shown credentials.
export const DEMO_EMAIL = 'test@cadence.com'
export const DEMO_PASSWORD = 'Cadence!'

export function DemoLogin({
  buttonLabel = 'Try the full app (demo login)',
  credentialsLabel = 'or log in with',
  errorMessage = 'Could not open the demo account',
}: {
  buttonLabel?: string
  credentialsLabel?: string
  errorMessage?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function enter() {
    setLoading(true)
    try {
      // Fresh slate for everyone (best-effort — login still works if it fails).
      await fetch('/api/demo/reset', { method: 'POST' }).catch(() => {})
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message || errorMessage)
      setLoading(false)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-1.5 sm:w-auto sm:max-w-none sm:items-start">
      <Button size="lg" variant="secondary" className="h-auto min-h-12 w-full gap-2 whitespace-normal px-4 text-center text-base sm:h-12 sm:w-auto sm:whitespace-nowrap sm:px-7" onClick={enter} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} {buttonLabel}
      </Button>
      <p className="text-xs text-muted-foreground">
        {credentialsLabel} <span className="font-medium text-foreground">{DEMO_EMAIL}</span> / <span className="font-medium text-foreground">{DEMO_PASSWORD}</span>
      </p>
    </div>
  )
}
