'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Clock,
  MessageSquare,
  Mic,
  PlayCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { DemoLogin } from '@/components/landing/demo-login'
import { PhoneShowcase, PhoneRow } from '@/components/landing/phone-showcase'
import {
  LANDING_COPY,
  isLandingLocale,
  type LandingLocale,
} from '@/components/landing/landing-copy'
import { LandingLanguageSwitcher } from '@/components/landing/landing-language-switcher'
import { ProductStory } from '@/components/landing/product-story'

const LANDING_LOCALE_STORAGE_KEY = 'cadence-landing-locale'
const FEATURE_ICONS = {
  optimize: Wand2,
  language: Bot,
  control: ShieldCheck,
  insights: BarChart3,
  business: Sparkles,
} as const
const PHONE_CARD_CONFIG = [
  {
    copyIndex: 0,
    icon: Clock,
    zoomImage: '/landing/mobile-calendar-optimizer.png',
    position: '-right-2 top-10 sm:-right-8 xl:-right-12 2xl:-right-28',
  },
  {
    copyIndex: 1,
    icon: MessageSquare,
    zoomImage: undefined,
    position: '-right-2 top-1/2 sm:-right-8 xl:-right-12 2xl:-right-28',
  },
  {
    copyIndex: 2,
    icon: Mic,
    zoomImage: '/landing/mobile-calendar-voice.png',
    position: '-right-2 bottom-14 sm:-right-8 xl:-right-12 2xl:-right-28',
  },
] as const

export function Landing() {
  const [locale, setLocale] = useState<LandingLocale>('en')
  const copy = LANDING_COPY[locale]
  const phoneCards = PHONE_CARD_CONFIG.map((config, index) => ({
    ...copy.phone.cards[config.copyIndex],
    icon: config.icon,
    zoomImage: config.zoomImage,
    zoomAlt: '',
    position: config.position,
    delay: 0.1 + index * 0.2,
  }))

  useEffect(() => {
    const stored = localStorage.getItem(LANDING_LOCALE_STORAGE_KEY)
    if (isLandingLocale(stored)) setLocale(stored)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  function changeLocale(nextLocale: LandingLocale) {
    setLocale(nextLocale)
    localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, nextLocale)
  }

  return (
    <div data-testid="landing-root" className="min-h-screen overflow-x-clip bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:h-16 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1.5 sm:gap-3">
            <LandingLanguageSwitcher
              locale={locale}
              onChange={changeLocale}
            />
            <span className="hidden sm:inline-flex"><ThemeToggle /></span>
            <Link href="/demo" className="hidden sm:inline-flex"><Button variant="ghost" className="gap-1.5"><PlayCircle className="h-4 w-4" /> {copy.header.demo}</Button></Link>
            <Link href="/login" className="hidden sm:inline-flex"><Button variant="ghost">{copy.header.login}</Button></Link>
            <Link href="/signup"><Button>{copy.header.started}</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-10%] h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-primary/25 via-[hsl(262_83%_58%)]/15 to-transparent blur-3xl" />
        </div>
        <div className="container grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-sm">
              <Sparkles className="h-4 w-4 text-primary" /> {copy.hero.badge}
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
              className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
              {copy.hero.title}
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-5 max-w-3xl text-pretty text-base font-normal text-foreground sm:mt-6 sm:text-xl sm:font-medium">
              {copy.hero.desc}
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.18 }}
              className="mt-9 flex w-full max-w-sm flex-col items-center gap-3 sm:w-auto sm:max-w-none sm:flex-row lg:items-start">
              <Link href="/signup"><Button size="lg" className="h-12 px-7 text-base">{copy.hero.tryFree} <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
              <Link href="/demo"><Button size="lg" variant="outline" className="h-12 gap-2 px-7 text-base"><PlayCircle className="h-4 w-4" /> {copy.hero.tryNoAccount}</Button></Link>
              <DemoLogin
                buttonLabel={copy.demo.button}
                credentialsLabel={copy.demo.credentials}
                errorMessage={copy.demo.error}
              />
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="hidden justify-center lg:flex">
            <PhoneShowcase
              screenshot="/landing/mobile-calendar.png"
              alt={copy.phone.alt}
              placeholder={copy.phone.placeholder}
              cards={phoneCards}
              className="origin-center transition-transform lg:scale-[0.72] xl:scale-[0.82] 2xl:scale-100"
            />
          </motion.div>
        </div>
      </section>

      {/* Value + product walkthrough */}
      <section className="border-y border-border bg-muted/20">
        <div className="container flex flex-col py-16 sm:py-28">
          <div className="order-2 mx-auto mt-12 max-w-2xl text-center sm:order-1 sm:mt-0">
            <h2 className="hidden text-balance text-3xl font-bold tracking-tight sm:block sm:text-4xl">{copy.value.heading}</h2>
            <p className="text-balance text-base text-muted-foreground sm:mt-4 sm:text-lg">
              {copy.value.desc}
            </p>
          </div>

          <div className="order-1 mt-0 sm:order-2 sm:mt-20">
            <ProductStory
              ariaLabel={copy.story.ariaLabel}
              steps={copy.story.steps}
            />
          </div>

          <div className="order-4 mt-14 flex justify-center sm:mt-16">
            <Link href="/demo"><Button size="lg" className="h-12 gap-2 px-7 text-base"><PlayCircle className="h-4 w-4" /> {copy.value.storyCta}</Button></Link>
          </div>
        </div>
      </section>

      <section className="container pt-24 sm:pt-28">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-sm">
            <Smartphone className="h-4 w-4 text-primary" /> {copy.mobile.badge}
          </div>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{copy.mobile.title}</h2>
          <p className="mt-4 text-balance text-base text-muted-foreground sm:text-lg">
            {copy.mobile.desc}
          </p>
        </div>
        <PhoneRow
          screenshots={[
            '/landing/mobile-clients.png',
            '/landing/mobile-voice.png',
            '/landing/mobile-scheduler.png',
          ]}
          alt={copy.phone.alt}
          placeholder={copy.phone.placeholder}
        />
      </section>

      <section className="container pb-28 pt-24 sm:pt-28">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {copy.features.slice(0, 3).map((f, i) => {
            const Icon = FEATURE_ICONS[f.id]
            return (
            <motion.div data-testid="landing-feature-card" key={f.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.05 }}
              className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
            )
          })}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container flex flex-col gap-6 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo />
            <nav className="flex items-center gap-5 text-sm text-muted-foreground">
              <Link href="/terms" className="transition-colors hover:text-foreground">{copy.footer.terms}</Link>
              <Link href="/privacy" className="transition-colors hover:text-foreground">{copy.footer.privacy}</Link>
              <a href="mailto:marazzi.marco@yahoo.com" className="transition-colors hover:text-foreground">{copy.footer.contact}</a>
            </nav>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Cadence — {copy.footer.credit}</p>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>{copy.footer.disclaimer}</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
