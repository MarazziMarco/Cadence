'use client'

import { useMemo, type Ref } from 'react'

import { fmtTime, timeToMin, type CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  weekRange,
} from '@/lib/calendar/date'
import type { CalendarView } from '@/lib/calendar/types'
import { WEEKDAYS } from '@/lib/types/db'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { CalendarToolbar } from './calendar-toolbar'

interface MobileWeekTimelineProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  onSelectDate(date: string): void
  onSelectAppointment(id: string): void
  onNavigate?(direction: -1 | 1): void
  onViewChange(view: CalendarView): void
  onOptimize?(): void
  optimizeButtonRef?: Ref<HTMLButtonElement>
}

const START = 7 * 60
const END = 21 * 60
const SPAN = END - START

function weekday(date: string) {
  const value = new Date(`${date}T12:00:00Z`).getUTCDay()
  return WEEKDAYS[(value + 6) % 7]
}

export function MobileWeekTimeline({
  appointments,
  config,
  selectedDate,
  onSelectDate,
  onSelectAppointment,
  onNavigate,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: MobileWeekTimelineProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const { from } = weekRange(selectedDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addBusinessDays(from, index)),
    [from],
  )

  return (
    <section
      data-testid="mobile-week-timeline"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <CalendarToolbar
        selectedDate={selectedDate}
        view="week"
        enabledViews={['day', 'week', 'month', 'agenda']}
        onToday={() => onSelectDate(businessToday(config.timezone))}
        onNavigate={onNavigate}
        onViewChange={onViewChange}
        onOptimize={onOptimize}
        optimizeButtonRef={optimizeButtonRef}
      />
      <div className="divide-y divide-border">
        {days.map((date) => {
          const hours = config.workingHours.find(
            (item) => item.weekday === weekday(date),
          )
          const dayAppointments = appointments
            .filter((appointment) => appointment.appointment_date === date)
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
          const lunchStart = hours?.morning_end
            ? timeToMin(hours.morning_end)
            : null
          const lunchEnd = hours?.afternoon_start
            ? timeToMin(hours.afternoon_start)
            : null

          return (
            <div className="grid min-h-[4.75rem] grid-cols-[3.75rem_1fr]" key={date}>
              <button
                type="button"
                className="flex flex-col items-center justify-center bg-muted/25 text-xs font-semibold"
                onClick={() => {
                  onSelectDate(date)
                  onViewChange('day')
                }}
              >
                <span className="uppercase text-muted-foreground">
                  {formatBusinessDate(date, dateLocale, { weekday: 'short' })}
                </span>
                <span className="text-base">
                  {formatBusinessDate(date, dateLocale, { day: 'numeric' })}
                </span>
              </button>
              <div
                data-testid={`timeline-day-${date}`}
                className="relative m-2 overflow-hidden rounded-lg bg-muted/20"
                onClick={() => {
                  onSelectDate(date)
                  onViewChange('day')
                }}
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <span
                    key={index}
                    aria-hidden
                    className="absolute inset-y-0 border-l border-border/60"
                    style={{ left: `${index / 7 * 100}%` }}
                  />
                ))}
                {lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart ? (
                  <span
                    data-testid={`timeline-closure-${lunchStart}-${lunchEnd}`}
                    className="absolute inset-y-0 bg-muted/70"
                    style={{
                      left: `${(lunchStart - START) / SPAN * 100}%`,
                      width: `${(lunchEnd - lunchStart) / SPAN * 100}%`,
                    }}
                  />
                ) : null}
                {!hours?.is_open ? (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                    {t('cal.closed')}
                  </span>
                ) : null}
                {dayAppointments.map((appointment) => {
                  const start = timeToMin(appointment.start_time)
                  const color = appointment.color
                    || appointment.services?.color
                    || '#6d4bd8'
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      data-testid={`timeline-appointment-${appointment.id}`}
                      data-appointment-id={appointment.id}
                      className="absolute inset-y-1 overflow-hidden rounded-md border-l-[3px] px-1 text-left text-[9px] font-semibold"
                      style={{
                        left: `${(start - START) / SPAN * 100}%`,
                        width: `${appointment.duration_minutes / SPAN * 100}%`,
                        minWidth: 22,
                        backgroundColor: `${color}22`,
                        borderColor: color,
                      }}
                      aria-label={[
                        fmtTime(appointment.start_time),
                        appointment.patients?.full_name || t('dash.client'),
                      ].join(', ')}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectAppointment(appointment.id)
                      }}
                    >
                      {appointment.patients?.first_name || fmtTime(appointment.start_time)}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
