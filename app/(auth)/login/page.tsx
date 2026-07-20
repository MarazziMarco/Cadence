'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogoLoader } from '@/components/brand/logo-loader'
import { usePublicT } from '@/lib/i18n/use-public-t'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()
  const { t } = usePublicT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      toast.error(t('auth.loginFailed'))
      return
    }
    // Keep a branded full-screen loader up while the workspace loads (entering
    // the app can take a moment) so it's clear the login is going through.
    setRedirecting(true)
    const redirect = params.get('redirect') || '/dashboard'
    router.push(redirect)
    router.refresh()
  }

  if (redirecting) return <LogoLoader label={t('auth.signingIn')} />

  return (
    <div>
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t('auth.backHome')}</Link>
      <h1 className="text-2xl font-bold tracking-tight">{t('auth.login.title')}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t('auth.login.subtitle')}</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" required autoComplete="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">{t('auth.forgotPassword')}</Link>
          </div>
          <Input id="password" type="password" required autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t('auth.logIn')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('auth.noAccount')} <Link href="/signup" className="font-medium text-primary hover:underline">{t('auth.signUp')}</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
