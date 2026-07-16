'use client'

import { memo, useMemo, type Ref } from 'react'
import { CalendarDays, ChevronDown, WandSparkles } from 'lucide-react'

import { formatBusinessDate } from '@/lib/calendar/date'
import type { CalendarView } from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'

interface CalendarToolbarProps {
  selectedDate: string
  view: CalendarView
  enabledViews?: readonly CalendarView[]
  onToday(): void
  onViewChange(view: CalendarView): void
  onOptimize?(): void
  optimizeButtonRef?: Ref<HTMLButtonElement>
}

const VIEWS: CalendarView[] = ['day', 'week', 'month', 'agenda']
const DAY_ONLY: readonly CalendarView[] = ['day']

function CalendarToolbarComponent({
  selectedDate,
  view,
  enabledViews = DAY_ONLY,
  onToday,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: CalendarToolbarProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const enabled = useMemo(() => new Set(enabledViews), [enabledViews])

  return (
    <header className="flex items-center gap-2 px-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold tracking-tight">
          {formatBusinessDate(selectedDate, dateLocale, {
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <p className="truncate text-xs capitalize text-muted-foreground">
          {formatBusinessDate(selectedDate, dateLocale, {
            weekday: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      <button
        type="button"
        className="h-11 shrink-0 rounded-lg border border-input bg-background px-3 text-sm font-semibold shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToday}
      >
        {t('cal.today')}
      </button>

      <label className="relative flex h-11 w-[5.75rem] shrink-0 items-center rounded-lg border border-input bg-background pl-3 pr-8 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <span className="sr-only">{t('cal.viewMenu')}</span>
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        <select
          aria-label={t('cal.viewMenu')}
          value={view}
          className="absolute inset-0 cursor-pointer appearance-none bg-transparent pl-10 pr-8 text-sm font-semibold text-foreground outline-none"
          onChange={(event) => onViewChange(event.target.value as CalendarView)}
        >
          {VIEWS.map((item) => (
            <option
              key={item}
              disabled={!enabled.has(item)}
              value={item}
            >
              {t(`cal.view.${item}`)}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 h-3.5 w-3.5"
          aria-hidden="true"
        />
      </label>

      {onOptimize ? (
        <button
          ref={optimizeButtonRef}
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t(`cal.optimize.${view}`)}
          title={t(`cal.optimize.${view}`)}
          onClick={onOptimize}
        >
          <WandSparkles className="h-4 w-4" />
        </button>
      ) : null}
    </header>
  )
}

export const CalendarToolbar = memo(CalendarToolbarComponent)
