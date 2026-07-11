'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { LayoutDashboard, CalendarDays, Users, Wand2, Plus, CalendarPlus, UserPlus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const LEFT = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
]
const RIGHT = [
  { href: '/patients', label: 'Clients', icon: Users },
  { href: '/scheduler', label: 'Scheduler', icon: Wand2 },
]
const CREATE = [
  { href: '/calendar?new=1', label: 'Nuovo appuntamento', icon: CalendarPlus },
  { href: '/patients?new=1', label: 'Nuovo cliente', icon: UserPlus },
  { href: '/services?new=1', label: 'Nuovo servizio', icon: Sparkles },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const go = (href: string) => { setOpen(false); router.push(href) }

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
        {it.label}
      </Link>
    )
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch justify-around border-t border-border bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {LEFT.map(Item)}

      <div className="flex flex-1 items-center justify-center">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Crea nuovo"
              className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform duration-200 active:scale-90"
            >
              <Plus className={cn('h-6 w-6 transition-transform duration-300', open && 'rotate-45')} />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl border-border pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <SheetHeader className="text-left"><SheetTitle>Crea nuovo</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-2">
              {CREATE.map((c) => (
                <button
                  key={c.href}
                  onClick={() => go(c.href)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left font-medium transition-all duration-200 hover:bg-accent active:scale-[0.98]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-5 w-5" /></span>
                  {c.label}
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
