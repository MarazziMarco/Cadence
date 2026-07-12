'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/use-t'

// Shared header for Clients / Services: the current page is big, the other is a
// small clickable label beside it (same pattern as Calendar / Waiting list).
// An optional action (e.g. the New button) sits on the right.
export function ClientsServicesTabs({ current, action }: { current: 'clients' | 'services'; action?: ReactNode }) {
  const { t } = useT()
  const tabs = [
    { href: '/patients', label: t('nav.patients'), key: 'clients' as const },
    { href: '/services', label: t('nav.services'), key: 'services' as const },
  ]
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {tabs.map((tab) => (
          <Link key={tab.key} href={tab.href}
            className={cn('tracking-tight transition-colors', current === tab.key ? 'text-2xl font-bold' : 'text-sm font-medium text-muted-foreground hover:text-foreground')}>
            {tab.label}
          </Link>
        ))}
      </div>
      {action}
    </div>
  )
}
