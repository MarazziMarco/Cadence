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

export function DemoLogin() {
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
      toast.error(e?.message || 'Could not open the demo account')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5 sm:items-start">
      <Button size="lg" variant="secondary" className="h-12 gap-2 px-7 text-base" onClick={enter} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Try the full app (demo login)
      </Button>
      <p className="text-xs text-muted-foreground">
        or log in with <span className="font-medium text-foreground">{DEMO_EMAIL}</span> / <span className="font-medium text-foreground">{DEMO_PASSWORD}</span>
      </p>
    </div>
  )
}
