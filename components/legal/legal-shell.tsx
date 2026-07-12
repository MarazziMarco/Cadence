import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { Disclaimer } from './disclaimer'

// Public, login-free shell for the /terms and /privacy pages. Matches the app's
// palette/typography. No hooks — safe as a server component.
export function LegalShell({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/"><Logo /></Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground sm:gap-6">
            <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          </nav>
        </div>
      </header>

      <main className="container max-w-2xl py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>}

        <div className="mt-8">
          <Disclaimer lang="both" />
        </div>

        <div className="mt-8 space-y-8">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-3 py-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Cadence — Built by Marco Marazzi</p>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">Home</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

// Small section helper for legal copy.
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  )
}
