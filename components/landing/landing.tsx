'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Wand2, Bot, ShieldCheck, Sparkles, BarChart3, PlayCircle, Mic, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { cn } from '@/lib/utils'
import { BRAND } from '@/lib/brand'

// The three headline value props.
const VALUE = [
  { icon: Wand2, title: 'Time & money, your way', desc: 'Optimize within your own rules — working hours, priorities, how tightly to pack the day. Cadence turns wasted gaps into billable time.' },
  { icon: Mic, title: 'Natural language & voice', desc: 'Register clients and appointments just by speaking. No forms, no typing — dictate when clients are free and Cadence writes it down.' },
  { icon: MessageSquare, title: 'Clients kept in the loop', desc: 'Every schedule change comes with a ready-to-send message, so no client is ever left guessing about their new time.' },
]

// Visual walkthrough — real product screenshots.
const STEPS: { img: string; title: string; desc: string; imgMax?: string }[] = [
  { img: '/landing/voice.png', title: 'Book by voice', desc: 'Add clients and appointments just by talking. Say “Marco on Tuesday at 3pm” and Cadence fills in the rest — perfect for capturing when clients are available.' },
  { img: '/landing/calendar-before.png', title: 'A week full of gaps', desc: "This is how most weeks look: appointments scattered with dead time in between — hours you're paying for but not using.", imgMax: 'max-w-[440px]' },
  { img: '/landing/optimizer.png', title: 'Smart suggestions, your call', desc: 'One click and Cadence proposes exactly which appointments to pull earlier to close the gaps. Keep or skip each move — nothing changes until you say so.', imgMax: 'max-w-[300px]' },
  { img: '/landing/calendar-after.png', title: 'A tight, optimized week', desc: 'Same appointments, hundreds of minutes of idle time recovered — automatically, and always within the rules you set.' },
  { img: '/landing/messages.png', title: 'Messages ready to send', desc: 'For every appointment that moved, Cadence writes a friendly message you can copy and send to the client in one tap.' },
]

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

      {/* Value + product walkthrough */}
      <section className="border-y border-border bg-muted/20">
        <div className="container py-20 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Speak. Optimize. Done.</h2>
            <p className="mt-4 text-balance text-lg text-muted-foreground">
              Cadence turns the dead gaps in your week into time and money — the way you want it. Talk to it in
              plain language, hit optimize, and your whole schedule rearranges itself the best possible way.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {VALUE.map((v, i) => (
              <motion.div key={v.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.06 }}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><v.icon className="h-5 w-5" /></div>
                <h3 className="text-base font-semibold">{v.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{v.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-20 space-y-16 lg:space-y-24">
            {STEPS.map((s, i) => {
              const imgLeft = i % 2 === 1
              return (
                <div key={s.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
                  <motion.div initial={{ opacity: 0, x: imgLeft ? 24 : -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.5 }}
                    className={cn(imgLeft && 'lg:order-2')}>
                    <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</div>
                    <h3 className="text-2xl font-bold tracking-tight">{s.title}</h3>
                    <p className="mt-3 text-muted-foreground">{s.desc}</p>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, x: imgLeft ? -32 : 32, scale: 0.96 }} whileInView={{ opacity: 1, x: 0, scale: 1 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className={cn('group relative', imgLeft && 'lg:order-1')}>
                    <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                    <img src={s.img} alt={s.title} loading="lazy"
                      className={cn('w-full rounded-xl border border-border object-contain shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl', s.imgMax, s.imgMax && 'mx-auto')} />
                  </motion.div>
                </div>
              )
            })}
          </div>

          <div className="mt-16 flex justify-center">
            <Link href="/demo"><Button size="lg" className="h-12 gap-2 px-7 text-base"><PlayCircle className="h-4 w-4" /> Try it yourself — no account needed</Button></Link>
          </div>
        </div>
      </section>

      <section className="container pb-28 pt-28">
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
