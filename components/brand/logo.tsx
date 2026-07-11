import { cn } from '@/lib/utils'

// Cadence brand lockup: colored "C" wave mark + wordmark (provided assets).
// - Mark stays colorful on any background.
// - Wordmark is dark navy; it auto-inverts to white in dark mode, and callers on
//   colored/dark surfaces can force white via `[&_img]:brightness-0 [&_img]:invert`.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 select-none items-center gap-2', className)}>
      <img src="/cadence-mark.png" alt="Cadence" width={338} height={319} className="h-7 w-auto shrink-0 object-contain" />
      <img
        src="/cadence-wordmark.png"
        alt=""
        aria-hidden
        width={876}
        height={133}
        className="h-4 w-auto shrink-0 object-contain dark:brightness-0 dark:invert"
      />
    </span>
  )
}
