'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarClient } from '@/components/calendar/calendar-client'
import { WaitingListClient } from '@/components/waiting-list/waiting-list-client'

// One in-page switch (not a route change): the active view is big, the other is
// a small clickable label beside it.
export default function CalendarPage() {
  const [tab, setTab] = useState<'calendar' | 'waiting'>('calendar')
  const kbd = 'rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground'
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => setTab('calendar')} className={cn('tracking-tight transition-colors', tab === 'calendar' ? 'text-2xl font-bold' : 'text-sm font-medium text-muted-foreground hover:text-foreground')}>Calendar</button>
        <button onClick={() => setTab('waiting')} className={cn('tracking-tight transition-colors', tab === 'waiting' ? 'text-2xl font-bold' : 'text-sm font-medium text-muted-foreground hover:text-foreground')}>Waiting list</button>
        {tab === 'calendar' && (
          <Popover>
            <PopoverTrigger asChild>
              <button aria-label="Shortcuts & tips" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Info className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <p className="mb-2 text-sm font-semibold">Shortcuts & tips</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><kbd className={kbd}>n</kbd> New appointment</li>
                <li><kbd className={kbd}>w</kbd> / <kbd className={kbd}>d</kbd> Week / day view</li>
                <li><kbd className={kbd}>←</kbd> <kbd className={kbd}>→</kbd> Previous / next</li>
                <li><kbd className={kbd}>t</kbd> Jump to today</li>
              </ul>
              <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">On desktop drag an appointment to move it; on touch, press and hold to grab it. Tap an empty slot to book.</p>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {tab === 'calendar' ? <CalendarClient /> : <WaitingListClient hideHeader />}
    </div>
  )
}
