'use client'

import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { Disclaimer } from './disclaimer'
import { usePublicT } from '@/lib/i18n/use-public-t'

const PAGE_SECTIONS = {
  terms: [
    ['legal.terms.nature', 'legal.terms.natureBody'],
    ['legal.terms.permitted', 'legal.terms.permittedBody'],
    ['legal.terms.warranty', 'legal.terms.warrantyBody'],
    ['legal.terms.liability', 'legal.terms.liabilityBody'],
    ['legal.terms.changes', 'legal.terms.changesBody'],
  ],
  privacy: [
    ['legal.privacy.nature', 'legal.privacy.natureBody'],
    ['legal.privacy.data', 'legal.privacy.dataBody'],
    ['legal.privacy.use', 'legal.privacy.useBody'],
    ['legal.privacy.storage', 'legal.privacy.storageBody'],
    ['legal.privacy.choices', 'legal.privacy.choicesBody'],
  ],
} as const

export function LegalShell({ page }: { page: 'terms' | 'privacy' }) {
  const { t, locale } = usePublicT()
  const titleKey = page === 'terms' ? 'legal.terms.title' : 'legal.privacy.title'
  const contactCopy = page === 'terms' ? t('legal.questions') : t('legal.privacy.questions')

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/"><Logo /></Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground sm:gap-6">
            <Link href="/terms" className="transition-colors hover:text-foreground">{t('legal.terms')}</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">{t('legal.privacy')}</Link>
          </nav>
        </div>
      </header>

      <main className="container max-w-2xl py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t(titleKey)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('legal.lastUpdated', { date: t('legal.updatedJuly2026') })}
        </p>

        <div className="mt-8">
          <Disclaimer lang={locale} />
        </div>

        <div className="mt-8 space-y-8">
          {PAGE_SECTIONS[page].map(([heading, body]) => (
            <LegalSection key={heading} heading={t(heading)}>
              <p>{t(body)}</p>
            </LegalSection>
          ))}
          <LegalSection heading={t('legal.contact')}>
            <p>
              {contactCopy}{' '}
              <a href="mailto:marazzi.marco@yahoo.com" className="text-primary hover:underline">
                marazzi.marco@yahoo.com
              </a>
            </p>
          </LegalSection>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-3 py-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Cadence — {t('legal.builtBy')}</p>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">{t('legal.home')}</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">{t('legal.terms')}</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">{t('legal.privacy')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  )
}
