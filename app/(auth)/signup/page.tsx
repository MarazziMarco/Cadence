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

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptBeta, setAcceptBeta] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!acceptTerms || !acceptBeta) {
      toast.error('Please accept both checkboxes to continue.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    if (data.session) {
      toast.success('Account created!')
      router.push('/onboarding')
      router.refresh()
    } else {
      toast.success('Check your email to confirm your account.')
      router.push('/login')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Create your workspace</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Start scheduling smarter in minutes.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" required placeholder="Dr. Anna Rossi" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required autoComplete="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required autoComplete="new-password" minLength={6} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(v === true)} className="mt-0.5" />
            <span className="text-muted-foreground">
              I have read and accept the{' '}
              <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">Terms of Service</Link>{' '}and{' '}
              <Link href="/privacy" target="_blank" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={acceptBeta} onCheckedChange={(v) => setAcceptBeta(v === true)} className="mt-0.5" />
            <span className="text-muted-foreground">
              I understand this app is <span className="font-medium text-foreground">under active development and testing</span> and is <span className="font-medium text-foreground">not yet suitable for storing sensitive or real personal data</span>.
            </span>
          </label>
        </div>

        <Button type="submit" className="w-full" disabled={loading || !acceptTerms || !acceptBeta}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Log in</Link>
      </p>
    </div>
  )
}
