'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Users, Wand2, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'

export type QuickKind = 'appointment' | 'client' | 'voice'

const LEFT = [
  { href: '/dashboard', icon: LayoutDashboard },
  { href: '/calendar', icon: CalendarDays },
]
const RIGHT = [
  { href: '/patients', icon: Users },
  { href: '/scheduler', icon: Wand2 },
]

export function BottomNav({
  onQuickCreate,
  voiceListening = false,
}: {
  onQuickCreate: (kind: QuickKind) => void
  voiceListening?: boolean
}) {
  const pathname = usePathname()
  const { t } = useT()

  const Item = (it: any) => {
    const active = pathname === it.href || pathname.startsWith(it.href + '/')
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors active:scale-95',
          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className={cn('flex h-8 w-12 items-center justify-center rounded-full transition-all duration-200', active ? 'bg-primary/10' : 'bg-transparent')}>
          <it.icon className={cn('h-5 w-5 transition-transform duration-200', active ? 'scale-110' : 'group-active:scale-90')} />
        </span>
        {navKey(it.href) ? t(navKey(it.href)!) : ''}
      </Link>
    )
  }

  return (
    <nav
      className="fixed inset-x-3 z-50 flex h-16 items-stretch justify-around rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur lg:hidden"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {LEFT.map(Item)}

      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          aria-label={t('create.speak')}
          aria-pressed={voiceListening}
          onClick={() => onQuickCreate('voice')}
          className={cn(
            '-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-lg ring-4 ring-background transition-all duration-200 active:scale-90',
            voiceListening
              ? 'animate-pulse bg-destructive shadow-destructive/30'
              : 'bg-primary shadow-primary/30',
          )}
        >
          <Mic className="h-6 w-6" />
        </button>
      </div>

      {RIGHT.map(Item)}
    </nav>
  )
}
