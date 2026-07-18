'use client'

import { memo, useMemo, useRef, type Ref, type TouchEvent } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  WandSparkles,
} from 'lucide-react'

import { formatBusinessDate, weekRange } from '@/lib/calendar/date'
import type { CalendarView } from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'

interface CalendarToolbarProps {
  selectedDate: string
  view: CalendarView
  enabledViews?: readonly CalendarView[]
  onToday(): void
  onViewChange(view: CalendarView): void
  onNavigate?(direction: -1 | 1): void
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
  onNavigate,
  onOptimize,
  optimizeButtonRef,
}: CalendarToolbarProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const enabled = useMemo(() => new Set(enabledViews), [enabledViews])
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const rangeLabel = useMemo(() => {
    if (view === 'month') {
      return formatBusinessDate(selectedDate, dateLocale, {
        month: 'long',
        year: 'numeric',
      })
    }
    if (view === 'week') {
      const range = weekRange(selectedDate)
      return `${formatBusinessDate(range.from, dateLocale, {
        month: 'short',
        day: 'numeric',
      })} – ${formatBusinessDate(range.to, dateLocale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`
    }
    return formatBusinessDate(selectedDate, dateLocale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }, [dateLocale, selectedDate, view])

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch || !onNavigate) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    onNavigate(deltaX < 0 ? 1 : -1)
  }

  return (
    <header className="px-2 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold tracking-tight" suppressHydrationWarning>
            {formatBusinessDate(selectedDate, dateLocale, {
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <p className="truncate text-xs capitalize text-muted-foreground" suppressHydrationWarning>
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
      </div>

      {onNavigate ? (
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-input bg-background shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('common.previous')}
            onClick={() => onNavigate(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div
            data-testid="calendar-range-label"
            className="flex h-11 min-w-0 flex-1 touch-pan-y select-none items-center justify-center rounded-lg bg-muted/40 px-3 text-center text-sm font-semibold capitalize"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            suppressHydrationWarning
          >
            {rangeLabel}
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-input bg-background shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('common.next')}
            onClick={() => onNavigate(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </header>
  )
}

export const CalendarToolbar = memo(CalendarToolbarComponent)
