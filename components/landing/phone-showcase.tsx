'use client'

/**
 * PhoneShowcase — frame smartphone in puro CSS con card "notifica" flottanti che
 * sbordano dai lati (effetto stile screenshot che ti piaceva).
 *
 * USO RAPIDO (in landing.tsx):
 *
 *   import { PhoneShowcase, PhoneRow } from '@/components/landing/phone-showcase'
 *
 *   <PhoneShowcase screenshot="/landing/app-dashboard.png" />
 *
 * Senza `screenshot` mostra un placeholder elegante: puoi montare tutto ora e
 * aggiungere le foto dopo. Le card sono personalizzabili via prop `cards`.
 * Usa i token del design system (border, card, primary, muted) e framer-motion
 * già presente nel progetto. prefers-reduced-motion rispettato.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, Clock, MessageSquare, Mic, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Frame telefono (solo CSS: nessuna immagine di iPhone da licenziare) */
/* ------------------------------------------------------------------ */

export function PhoneFrame({
  screenshot,
  alt = 'Cadence app',
  placeholder = 'Product screenshot coming soon',
  className,
}: {
  screenshot?: string
  alt?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        // scocca
        'relative w-full max-w-[300px] rounded-[48px] border border-black/60',
        'bg-[#0c0e14] p-[10px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]',
        className,
      )}
    >
      {/* dynamic island */}
      <div className="absolute left-1/2 top-[18px] z-10 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" />
      {/* tasti laterali (dettaglio) */}
      <div className="absolute -left-[2px] top-[18%] h-10 w-[3px] rounded-l bg-black/70" />
      <div className="absolute -left-[2px] top-[30%] h-14 w-[3px] rounded-l bg-black/70" />
      <div className="absolute -right-[2px] top-[24%] h-16 w-[3px] rounded-r bg-black/70" />

      {/* schermo */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-[38px] bg-background',
          !screenshot && 'aspect-[9/19.5]',
        )}
      >
        {screenshot ? (
          <img
            src={screenshot}
            alt={alt}
            loading="lazy"
            className="h-auto w-full object-contain"
          />
        ) : (
          /* placeholder finché non carichi la screenshot */
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-primary/15 via-background to-background">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CalendarDays className="h-6 w-6" />
            </div>
            <p className="px-8 text-center text-xs text-muted-foreground">
              {placeholder}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------- */
/* Card flottante ("notifica") che sborda dal telefono  */
/* --------------------------------------------------- */

export type FloatCardSpec = {
  icon: LucideIcon
  zoomImage?: string
  zoomAlt?: string
  title: string
  meta?: string
  /** classi di posizionamento assoluto rispetto al wrapper, es. '-right-6 top-16' */
  position: string
  /** ritardo entrata + sfasamento del galleggiamento */
  delay?: number
}

function FloatCard({
  icon: Icon,
  zoomImage,
  zoomAlt = '',
  title,
  meta,
  position,
  delay = 0,
}: FloatCardSpec) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      data-testid="phone-floating-card"
      initial={{ opacity: 0, y: 14, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay }}
      className={cn('absolute z-20', position)}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -7, 0] }}
        transition={reduce ? undefined : { duration: 4.5 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
        className={cn(
          'flex items-center gap-3 rounded-2xl border border-border bg-card/90 px-4 py-3',
          'shadow-lg backdrop-blur-md',
        )}
      >
        {zoomImage ? (
          <img
            data-testid="phone-floating-zoom"
            src={zoomImage}
            alt={zoomAlt}
            className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="whitespace-nowrap text-sm font-semibold leading-tight">{title}</p>
          {meta && <p className="whitespace-nowrap text-xs text-muted-foreground">{meta}</p>}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------ */
/* Composizione: telefono + card che sbordano */
/* ------------------------------------------ */

const DEFAULT_CARDS: FloatCardSpec[] = [
  {
    icon: Clock,
    title: '120 min recovered',
    meta: 'This week · automatic',
    position: '-right-4 top-14 sm:-right-14',
    delay: 0.1,
  },
  {
    icon: MessageSquare,
    title: 'Message ready ✓',
    meta: 'Copy & send in one tap',
    position: '-right-2 bottom-24 sm:-right-10',
    delay: 0.25,
  },
  {
    icon: Mic,
    title: 'Booked by voice',
    meta: '"Marco, Tuesday 3pm"',
    position: '-left-2 top-1/3 sm:-left-12',
    delay: 0.4,
  },
]

export function PhoneShowcase({
  screenshot,
  cards = DEFAULT_CARDS,
  alt,
  placeholder,
  className,
}: {
  screenshot?: string
  cards?: FloatCardSpec[]
  alt?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div
      data-testid="hero-phone-showcase"
      className={cn('relative mx-auto w-fit px-10 py-6 sm:px-16', className)}
    >
      <PhoneFrame
        screenshot={screenshot}
        alt={alt}
        placeholder={placeholder}
      />
      {cards.map((c) => (
        <FloatCard key={c.title} {...c} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- */
/* Fila finale di più telefoni ("funziona come app") — opzionale  */
/*                                                               */
/*   <PhoneRow screenshots={[                                     */
/*     '/landing/m-dashboard.png',                               */
/*     '/landing/m-calendar.png',                                */
/*     '/landing/m-optimize.png',                                */
/*   ]} />                                                        */
/* ------------------------------------------------------------- */

export function PhoneRow({
  screenshots,
  alt,
  placeholder,
  className,
}: {
  screenshots: (string | undefined)[]
  alt?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-end justify-center gap-4 sm:gap-8', className)}>
      {screenshots.map((src, i) => {
        const mid = (screenshots.length - 1) / 2
        const off = i - mid
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, delay: Math.abs(off) * 0.12 }}
            style={{ rotate: off * 3 }}
            className={cn(off !== 0 && 'hidden sm:block')}
          >
            <PhoneFrame
              screenshot={src}
              alt={alt}
              placeholder={placeholder}
              className={cn('w-[200px] sm:w-[230px]', off === 0 && 'z-10 w-[240px] sm:w-[270px]')}
            />
          </motion.div>
        )
      })}
    </div>
  )
}
