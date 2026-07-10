'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { LayoutDashboard, CalendarDays, Users, Settings, Plus, CalendarPlus, UserPlus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const LEFT = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
]
const RIGHT = [
  { href: '/patients', label: 'Clients', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const go = (href: string) => { setOpen(false); router.push(href) }
  const item = (it: any) => (
    <Link key={it.href} href={it.href} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', pathname.startsWith(it.href) ? 'text-primary' : 'text-muted-foreground')}>
      <it.icon className="h-5 w-5" />{it.label}
    </Link>
  )
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-background/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {LEFT.map(item)}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button aria-label="Create" className="-mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"><Plus className="h-6 w-6" /></button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Crea nuovo</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2 pb-6">
            <button onClick={() => go('/calendar?new=1')} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left font-medium"><CalendarPlus className="h-5 w-5 text-primary" /> Nuovo appuntamento</button>
            <button onClick={() => go('/patients?new=1')} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left font-medium"><UserPlus className="h-5 w-5 text-primary" /> Nuovo cliente</button>
            <button onClick={() => go('/services?new=1')} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left font-medium"><Sparkles className="h-5 w-5 text-primary" /> Nuovo servizio</button>
          </div>
        </SheetContent>
      </Sheet>
      {RIGHT.map(item)}
    </nav>
  )
}
