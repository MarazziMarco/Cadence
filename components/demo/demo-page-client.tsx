'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { usePublicT } from '@/lib/i18n/use-public-t'
import { DemoCalendar } from './demo-calendar'

export function DemoPageClient() {
  const { t } = usePublicT()

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-primary/20 bg-primary/10 px-4 py-2.5 text-center text-sm">
        <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>{t('demo.banner')}</span>
          <Link href="/signup" className="font-semibold text-primary underline underline-offset-2">{t('demo.bannerAction')}</Link>
          <span>{t('demo.bannerSuffix')}</span>
        </span>
      </div>

      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost">{t('auth.logIn')}</Button></Link>
            <Link href="/signup"><Button>{t('auth.signUp')}</Button></Link>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <DemoCalendar />
      </main>
    </div>
  )
}
