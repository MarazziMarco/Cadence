import { cn } from '@/lib/utils'

// Cadence wordmark — pure typography + color (no icon, no illustration).
// Micro-detail: the initial "C" and a trailing "beat" dot carry the indigo accent,
// evoking rhythm/flow; tight tracking gives it a crafted, modern feel.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex select-none items-baseline text-lg font-semibold tracking-tight text-foreground',
        className,
      )}
    >
      <span className="font-bold text-primary">C</span>
      <span>adence</span>
      <span aria-hidden className="ml-[1px] text-primary">.</span>
    </span>
  )
}
