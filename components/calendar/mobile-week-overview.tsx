'use client'

import { useMemo, type Ref } from 'react'

import type { CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  summarizeDayCapacity,
} from '@/lib/calendar/controller'
import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  weekRange,
} from '@/lib/calendar/date'
import type { CalendarView } from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { CalendarToolbar } from './calendar-toolbar'

interface MobileWeekOverviewProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  onSelectDay(date: string): void
  onViewChange(view: CalendarView): void
  onOptimize?(): void
  optimizeButtonRef?: Ref<HTMLButtonElement>
}

export function MobileWeekOverview({
  appointments,
  config,
  selectedDate,
  onSelectDay,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: MobileWeekOverviewProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const { from } = weekRange(selectedDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addBusinessDays(from, index)),
    [from],
  )
  const today = businessToday(config.timezone)

  return (
    <section
      data-testid="mobile-week-overview"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <CalendarToolbar
        selectedDate={selectedDate}
        view="week"
        enabledViews={['day', 'week', 'month', 'agenda']}
        onToday={() => onSelectDay(today)}
        onViewChange={onViewChange}
        onOptimize={onOptimize}
        optimizeButtonRef={optimizeButtonRef}
      />
      <div className="divide-y divide-border">
        {days.map((date) => {
          const summary = summarizeDayCapacity({
            date,
            appointments,
            config,
          })
          const markers = appointments
            .filter((appointment) => appointment.appointment_date === date)
            .slice(0, 3)

          return (
            <button
              key={date}
              type="button"
              className="flex min-h-11 w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => onSelectDay(date)}
            >
              <span className="w-20 shrink-0">
                <span className="block text-xs font-semibold capitalize text-muted-foreground">
                  {formatBusinessDate(date, dateLocale, { weekday: 'short' })}
                </span>
                <span className="block text-lg font-bold">
                  {formatBusinessDate(date, dateLocale, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                {summary.closed ? (
                  <span className="text-sm font-semibold text-muted-foreground">
                    {t('cal.closed')}
                  </span>
                ) : (
                  <>
                    <span className="block text-sm font-semibold">
                      {t('cal.capacityAppointments', {
                        n: summary.appointmentCount,
                      })}
                      {' · '}
                      {t('cal.capacityBooked', {
                        h: (summary.bookedMinutes / 60).toFixed(1),
                      })}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('cal.capacityIdle', { n: summary.idleMinutes })}
                      {' · '}
                      {t('cal.capacityGaps', { n: summary.gapCount })}
                    </span>
                  </>
                )}
              </span>
              <span className="flex w-12 shrink-0 justify-end gap-1">
                {markers.map((appointment) => (
                  <span
                    key={appointment.id}
                    title={appointment.title ?? appointment.status}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: appointment.color
                        || appointment.services?.color
                        || '#6d4bd8',
                    }}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
