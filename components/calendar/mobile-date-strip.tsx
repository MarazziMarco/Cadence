'use client'

import { memo, useMemo } from 'react'

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
  const days = useMemo(() => {
    const { from } = weekRange(selectedDate)
    return Array.from(
      { length: 7 },
      (_, index) => addBusinessDays(from, index),
    )
  }, [selectedDate])

  return (
    <nav
      aria-label={t('cal.dateStrip')}
      className="overflow-x-auto overscroll-x-contain border-b border-border bg-background px-2 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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
                onSelectDate(addBusinessDays(
                  date,
                  event.key === 'ArrowLeft' ? -1 : 1,
                ))
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
    </nav>
  )
}

export const MobileDateStrip = memo(MobileDateStripComponent)
