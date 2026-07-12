import Link from 'next/link'
import { cn } from '@/lib/utils'

// On mobile/tablet (no sidebar) Clients and Services are grouped under one tab
// switch, so Services is reachable from the Clients page and vice-versa.
export function ClientsServicesTabs({ current }: { current: 'clients' | 'services' }) {
  const tabs = [
    { href: '/patients', label: 'Clients', key: 'clients' as const },
    { href: '/services', label: 'Services', key: 'services' as const },
  ]
  return (
    <div className="mb-4 inline-flex rounded-lg border border-border p-0.5 lg:hidden">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href}
          className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors', current === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
