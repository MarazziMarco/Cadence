'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { LayoutDashboard, CalendarDays, Users, Wand2, Plus, CalendarPlus, UserPlus, Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export type QuickKind = 'appointment' | 'client' | 'voice'

const LEFT = [
  { href: '/dashboard', icon: LayoutDashboard },
  { href: '/calendar', icon: CalendarDays },
]
const RIGHT = [
  { href: '/patients', icon: Users },
  { href: '/scheduler', icon: Wand2 },
]
// The "+" opens these — each triggers a MODAL directly (faster than a page).
const CREATE: { kind: QuickKind; icon: any; labelKey: string; hintKey: string }[] = [
  { kind: 'voice', icon: Mic, labelKey: 'create.speak', hintKey: 'create.speakHint' },
  { kind: 'appointment', icon: CalendarPlus, labelKey: 'create.appointment', hintKey: 'create.appointmentHint' },
  { kind: 'client', icon: UserPlus, labelKey: 'create.client', hintKey: 'create.clientHint' },
]

export function BottomNav({ onQuickCreate }: { onQuickCreate: (kind: QuickKind) => void }) {
  const pathname = usePathname()
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const pick = (kind: QuickKind) => { setOpen(false); onQuickCreate(kind) }

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
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label={t('create.newAria')}
              className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform duration-200 active:scale-90"
            >
              <Plus className={cn('h-6 w-6 transition-transform duration-300', open && 'rotate-45')} />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl border-border pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <SheetHeader className="text-left"><SheetTitle>{t('create.new')}</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-2">
              {CREATE.map((c) => (
                <button
                  key={c.kind}
                  onClick={() => pick(c.kind)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-all duration-200 hover:bg-accent active:scale-[0.98]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block font-medium">{t(c.labelKey)}</span><span className="block text-xs text-muted-foreground">{t(c.hintKey)}</span></span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {RIGHT.map(Item)}
    </nav>
  )
}
