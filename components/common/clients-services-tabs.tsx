import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Shared header for Clients / Services: the current page is big, the other is a
// small clickable label beside it (same pattern as Calendar / Waiting list).
// An optional action (e.g. the New button) sits on the right.
export function ClientsServicesTabs({ current, action }: { current: 'clients' | 'services'; action?: ReactNode }) {
  const tabs = [
    { href: '/patients', label: 'Clients', key: 'clients' as const },
    { href: '/services', label: 'Services', key: 'services' as const },
  ]
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href}
            className={cn('tracking-tight transition-colors', current === t.key ? 'text-2xl font-bold' : 'text-sm font-medium text-muted-foreground hover:text-foreground')}>
            {t.label}
          </Link>
        ))}
      </div>
      {action}
    </div>
  )
}
