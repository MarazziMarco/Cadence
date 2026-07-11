'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Wand2, Bot, ShieldCheck, Sparkles, BarChart3, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { BRAND } from '@/lib/brand'

const features = [
  { icon: Wand2, title: 'Auto-optimized schedule', desc: 'One click builds the best possible day — respecting every rule you set.' },
  { icon: Bot, title: 'Natural language AI', desc: 'Type "Paola can come Wed or Fri" and Cadence turns it into a plan.' },
  { icon: ShieldCheck, title: 'You stay in control', desc: 'Every change is a preview. Accept, reject, compare, undo. Always.' },
  { icon: CalendarDays, title: 'Beautiful calendar', desc: 'Drag, drop, resize. Day, week, month, agenda. Fast as thought.' },
  { icon: BarChart3, title: 'Revenue insights', desc: 'Occupancy, idle time, revenue — the metrics that actually matter.' },
  { icon: Sparkles, title: 'Works for any business', desc: 'Clinics, salons, trainers, consultants, vets. Not tailored to one.' },
]

export function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link href="/demo" className="hidden sm:inline-flex"><Button variant="ghost" className="gap-1.5"><PlayCircle className="h-4 w-4" /> Try the demo</Button></Link>
            <Link href="/login"><Button variant="ghost">Log in</Button></Link>
            <Link href="/signup"><Button>Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-10%] h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-primary/25 via-[hsl(262_83%_58%)]/15 to-transparent blur-3xl" />
        </div>
        <div className="container flex flex-col items-center py-24 text-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-sm">
            <Sparkles className="h-4 w-4 text-primary" /> AI-powered scheduling, finally done right
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
            className="max-w-4xl text-balance text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
            The smartest way to run your schedule
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            {BRAND.description}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/signup"><Button size="lg" className="h-12 px-7 text-base">Try free <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
            <Link href="/demo"><Button size="lg" variant="outline" className="h-12 gap-2 px-7 text-base"><PlayCircle className="h-4 w-4" /> Try without an account</Button></Link>
          </motion.div>
        </div>
      </section>

      <section className="container pb-28">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.05 }}
              className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-4 py-10 sm:flex-row">
          <Logo />
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Cadence.. Crafted for modern businesses.</p>
        </div>
      </footer>
    </div>
  )
}
