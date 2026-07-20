'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePublicT } from '@/lib/i18n/use-public-t'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const { t } = usePublicT()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setLoading(false)
    if (error) {
      toast.error(t('auth.resetFailed'))
      return
    }
    setSent(true)
    toast.success(t('auth.resetSent'))
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t('auth.resetTitle')}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t('auth.resetSubtitle')}</p>
      {sent ? (
        <div className="mt-8 rounded-lg border border-border bg-accent/50 p-4 text-sm">
          {t('auth.resetConfirmation', { email })}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input id="email" type="email" required placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t('auth.sendReset')}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">{t('auth.backLogin')}</Link>
      </p>
    </div>
  )
}
