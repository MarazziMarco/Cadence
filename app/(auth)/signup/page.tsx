'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { usePublicT } from '@/lib/i18n/use-public-t'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const { t } = usePublicT()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptBeta, setAcceptBeta] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!acceptTerms || !acceptPrivacy || !acceptBeta) {
      toast.error(t('auth.mustAccept'))
      return
    }
    setLoading(true)
    // Record separate consents with version + timestamp (proof of acceptance).
    const at = new Date().toISOString()
    const consents = {
      terms: { accepted: true, version: 'terms-1.0', at },
      privacy: { seen: true, version: 'privacy-1.0', at },
      beta: { accepted: true, version: 'beta-1.0', at },
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, consents } },
    })
    setLoading(false)
    if (error) {
      toast.error(t('auth.signupFailed'))
      return
    }
    if (data.session) {
      toast.success(t('auth.accountCreated'))
      router.push('/onboarding')
      router.refresh()
    } else {
      toast.success(t('auth.checkEmail'))
      router.push('/login')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t('auth.signup.title')}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t('auth.signup.subtitle')}</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('auth.fullName')}</Label>
          <Input id="name" required placeholder="Dr. Anna Rossi" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" required autoComplete="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input id="password" type="password" required autoComplete="new-password" minLength={8} placeholder={t('auth.passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(v === true)} className="mt-0.5" />
            <span className="text-muted-foreground">
              {t('auth.acceptTermsOnly')}{' '}
              <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">{t('auth.terms')}</Link>.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={acceptPrivacy} onCheckedChange={(v) => setAcceptPrivacy(v === true)} className="mt-0.5" />
            <span className="text-muted-foreground">
              {t('auth.acceptPrivacy')}{' '}
              <Link href="/privacy" target="_blank" className="font-medium text-primary hover:underline">{t('auth.privacy')}</Link>.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={acceptBeta} onCheckedChange={(v) => setAcceptBeta(v === true)} className="mt-0.5" />
            <span className="text-muted-foreground">
              {t('auth.acceptBeta')}
            </span>
          </label>
        </div>

        <Button type="submit" className="w-full" disabled={loading || !acceptTerms || !acceptPrivacy || !acceptBeta}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t('auth.createAccount')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('auth.haveAccount')} <Link href="/login" className="font-medium text-primary hover:underline">{t('auth.logIn')}</Link>
      </p>
    </div>
  )
}
