import { Loader2 } from 'lucide-react'
import { Logo } from './logo'

// Full-screen branded loading state. No hooks, so it works as a Next.js
// route-level loading.tsx fallback and as an inline overlay on the client.
export function LogoLoader({ label }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background">
      <div className="animate-pulse">
        <Logo className="scale-125" />
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  )
}
