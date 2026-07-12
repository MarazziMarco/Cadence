'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarClient } from '@/components/calendar/calendar-client'
import { WaitingListClient } from '@/components/waiting-list/waiting-list-client'
import { useT } from '@/lib/i18n/use-t'

// One in-page switch (not a route change): the active view is big, the other is
// a small clickable label beside it.
export default function CalendarPage() {
  const { t } = useT()
  const [tab, setTab] = useState<'calendar' | 'waiting'>('calendar')
  const kbd = 'rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground'
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => setTab('calendar')} className={cn('tracking-tight transition-colors', tab === 'calendar' ? 'text-2xl font-bold' : 'text-sm font-medium text-muted-foreground hover:text-foreground')}>{t('cal.tab')}</button>
        <button onClick={() => setTab('waiting')} className={cn('tracking-tight transition-colors', tab === 'waiting' ? 'text-2xl font-bold' : 'text-sm font-medium text-muted-foreground hover:text-foreground')}>{t('cal.tabWaiting')}</button>
        {tab === 'calendar' && (
          <Popover>
            <PopoverTrigger asChild>
              <button aria-label={t('cal.shortcutsAria')} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Info className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              {/* Always shown: what the Waiting list is + how to reach it */}
              <p className="text-sm">{t('cal.wlInfo')}</p>
              {/* Keyboard shortcuts only make sense on desktop */}
              <div className="mt-3 hidden border-t border-border pt-3 sm:block">
                <p className="mb-2 text-sm font-semibold">{t('cal.shortcuts')}</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><kbd className={kbd}>n</kbd> {t('cal.sc.new')}</li>
                  <li><kbd className={kbd}>w</kbd> / <kbd className={kbd}>d</kbd> {t('cal.sc.weekDay')}</li>
                  <li><kbd className={kbd}>←</kbd> <kbd className={kbd}>→</kbd> {t('cal.sc.prevNext')}</li>
                  <li><kbd className={kbd}>t</kbd> {t('cal.sc.today')}</li>
                </ul>
              </div>
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{t('cal.dragTip')}</p>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {tab === 'calendar' ? <CalendarClient /> : <WaitingListClient hideHeader />}
    </div>
  )
}
