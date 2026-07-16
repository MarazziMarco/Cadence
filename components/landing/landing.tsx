'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarDays, Wand2, Bot, ShieldCheck, Sparkles, BarChart3, PlayCircle, Mic, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { Disclaimer } from '@/components/legal/disclaimer'
import { DemoLogin } from '@/components/landing/demo-login'
import { cn } from '@/lib/utils'

// Headline value prop.
const VALUE = [
  { icon: Mic, title: 'Natural language & voice', desc: 'Register clients and appointments just by speaking. No forms, no typing — dictate when clients are free and Cadence writes it down.' },
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
  { icon: BarChart3, title: 'Revenue insights', desc: 'Occupancy, idle time, revenue — the metrics that actually matter.' },
  { icon: Sparkles, title: 'Works for any business', desc: 'Clinics, salons, trainers, consultants, vets. Not tailored to one.' },
]

export function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:h-16 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1.5 sm:gap-3">
            <span className="hidden sm:inline-flex"><ThemeToggle /></span>
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
            <Sparkles className="h-4 w-4 text-primary" /> AI scheduling
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
            className="max-w-4xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
            Stop losing your Sunday to next week&apos;s schedule
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-5 max-w-3xl text-pretty text-base font-normal text-foreground sm:mt-6 sm:text-2xl sm:font-medium">
            If your week runs on appointments, you know the pain — nights and weekends spent arranging them by hand. Cadence rebuilds your whole week, the best way possible, in one click.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link href="/signup"><Button size="lg" className="h-12 px-7 text-base">Try free <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
            <Link href="/demo"><Button size="lg" variant="outline" className="h-12 gap-2 px-7 text-base"><PlayCircle className="h-4 w-4" /> Try without an account</Button></Link>
            <DemoLogin />
          </motion.div>
        </div>
      </section>

      {/* Value + product walkthrough */}
      <section className="border-y border-border bg-muted/20">
        <div className="container flex flex-col py-16 sm:py-28">
          <div className="order-2 mx-auto mt-12 max-w-2xl text-center sm:order-1 sm:mt-0">
            <h2 className="hidden text-balance text-3xl font-bold tracking-tight sm:block sm:text-4xl">Let Cadence build your week for you</h2>
            <p className="text-balance text-base text-muted-foreground sm:mt-4 sm:text-lg">
              Physiotherapists, osteopaths, salons, trainers, freelancers — millions of small businesses and
              self-employed pros burn nights and weekends shuffling appointments to close the gaps. It&apos;s a
              real, exhausting weekly puzzle. Cadence solves it: talk to it, optimize, done.
            </p>
          </div>

          <div className="order-3 mx-auto mt-10 grid w-full max-w-md gap-6 sm:mt-14">
            {VALUE.map((v, i) => (
              <motion.div key={v.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.06 }}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><v.icon className="h-5 w-5" /></div>
                <h3 className="text-base font-semibold">{v.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{v.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="order-1 mt-0 space-y-14 sm:order-2 sm:mt-20 sm:space-y-16 lg:space-y-24">
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

          <div className="order-4 mt-14 flex justify-center sm:mt-16">
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
        <div className="container flex flex-col gap-6 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo />
            <nav className="flex items-center gap-5 text-sm text-muted-foreground">
              <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
              <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
              <a href="mailto:marazzi.marco@yahoo.com" className="transition-colors hover:text-foreground">Contact</a>
            </nav>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Cadence — Built by Marco Marazzi</p>
          </div>
          <Disclaimer variant="compact" />
        </div>
      </footer>
    </div>
  )
}
