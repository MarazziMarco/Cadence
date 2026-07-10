'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CalendarClient } from '@/components/calendar/calendar-client'
import { WaitingListClient } from '@/components/waiting-list/waiting-list-client'

export default function CalendarPage() {
  const [tab, setTab] = useState<'calendar' | 'waiting'>('calendar')
  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {(['calendar', 'waiting'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {t === 'calendar' ? 'Calendar' : 'Waiting list'}
          </button>
        ))}
      </div>
      {tab === 'calendar' ? <CalendarClient /> : <WaitingListClient />}
    </div>
  )
}
