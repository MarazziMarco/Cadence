import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { DemoCalendar } from '@/components/demo/demo-calendar'

export const metadata = {
  title: 'Demo — Cadence',
  description: "Prova Cadence senza registrarti: ottimizza un'agenda finta in tempo reale.",
}

// Public route — intentionally NOT under app/(app) or app/(auth), and not
// listed in PROTECTED_PREFIXES (lib/supabase/middleware.ts), so it's reachable
// without a session. Everything here runs client-side, in memory.
export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-primary/20 bg-primary/10 px-4 py-2.5 text-center text-sm">
        <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Stai provando Cadence in modalità demo —</span>
          <Link href="/signup" className="font-semibold text-primary underline underline-offset-2">registrati</Link>
          <span>per usarla con i tuoi dati.</span>
        </span>
      </div>

      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost">Accedi</Button></Link>
            <Link href="/signup"><Button>Registrati</Button></Link>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <DemoCalendar />
      </main>
    </div>
  )
}
