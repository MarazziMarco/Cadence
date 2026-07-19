'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  weekRange,
} from '@/lib/calendar/date'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils'

interface MobileDateStripProps {
  selectedDate: string
  timezone: string
  onSelectDate(date: string): void
}

function MobileDateStripComponent({
  selectedDate,
  timezone,
  onSelectDate,
}: MobileDateStripProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const today = businessToday(timezone)
  const pendingFocusDateRef = useRef<string | null>(null)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const days = useMemo(() => {
    const { from } = weekRange(selectedDate)
    return Array.from(
      { length: 7 },
      (_, index) => addBusinessDays(from, index),
    )
  }, [selectedDate])

  useEffect(() => {
    const pendingDate = pendingFocusDateRef.current
    if (!pendingDate || pendingDate !== selectedDate) return
    buttonRefs.current.get(pendingDate)?.focus()
    pendingFocusDateRef.current = null
  }, [days, selectedDate])

  // Page the strip a whole week at a time so far-off days are reachable from the
  // phone day view without stepping one day per tap (the toolbar arrows step by
  // the current view: 1 day in day view). Keeps the selected weekday.
  const pageWeek = (direction: -1 | 1) =>
    onSelectDate(addBusinessDays(selectedDate, direction * 7))

  return (
    <nav
      aria-label={t('cal.dateStrip')}
      className="flex items-center gap-1 border-b border-border bg-background px-1 pb-2"
    >
      <button
        type="button"
        aria-label={t('cal.prevWeek')}
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => pageWeek(-1)}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full items-center justify-between gap-1">
        {days.map((date) => {
          const isSelected = date === selectedDate
          const isToday = date === today
          const label = formatBusinessDate(date, dateLocale, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })

          return (
            <button
              key={date}
              type="button"
              data-testid="mobile-date-button"
              data-today={isToday || undefined}
              aria-label={label}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              ref={(node) => {
                if (node) buttonRefs.current.set(date, node)
                else buttonRefs.current.delete(date)
              }}
              className={cn(
                'flex h-11 w-11 shrink-0 touch-manipulation flex-col items-center justify-center rounded-xl text-center',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground hover:bg-accent',
                isToday && !isSelected && 'ring-1 ring-primary',
                isToday && isSelected && 'ring-2 ring-primary ring-offset-2',
              )}
              onClick={() => onSelectDate(date)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                  return
                }
                event.preventDefault()
                event.stopPropagation()
                const nextDate = addBusinessDays(
                  date,
                  event.key === 'ArrowLeft' ? -1 : 1,
                )
                pendingFocusDateRef.current = nextDate
                onSelectDate(nextDate)
              }}
            >
              <span className="text-[10px] font-semibold uppercase leading-none opacity-75">
                {formatBusinessDate(date, dateLocale, { weekday: 'narrow' })}
              </span>
              <span className="mt-1 text-sm font-bold leading-none">
                {formatBusinessDate(date, dateLocale, { day: 'numeric' })}
              </span>
            </button>
          )
        })}
        </div>
      </div>
      <button
        type="button"
        aria-label={t('cal.nextWeek')}
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => pageWeek(1)}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </nav>
  )
}

export const MobileDateStrip = memo(MobileDateStripComponent)
