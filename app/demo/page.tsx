import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { DemoCalendar } from '@/components/demo/demo-calendar'

export const metadata = {
  title: 'Demo — Cadence',
  description: 'Try Cadence without signing up: optimize a sample schedule in real time.',
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
          <span>You're trying Cadence in demo mode —</span>
          <Link href="/signup" className="font-semibold text-primary underline underline-offset-2">sign up</Link>
          <span>to use it with your own data.</span>
        </span>
      </div>

      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button variant="ghost">Log in</Button></Link>
            <Link href="/signup"><Button>Sign up</Button></Link>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <DemoCalendar />
      </main>
    </div>
  )
}
