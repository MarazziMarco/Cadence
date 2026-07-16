'use client'

import { useMemo, useRef, type Ref, type TouchEvent } from 'react'

import {
  fmtTime,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  businessToday,
  formatBusinessDate,
} from '@/lib/calendar/date'
import { buildMonthCells } from '@/lib/calendar/month'
import type { CalendarView } from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils'
import { CalendarToolbar } from './calendar-toolbar'

interface MobileMonthCalendarProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  onSelectDate(date: string): void
  onSelectAppointment(id: string): void
  onNavigateMonth(direction: -1 | 1): void
  onViewChange(view: CalendarView): void
  onOptimize?(): void
  optimizeButtonRef?: Ref<HTMLButtonElement>
}

function patientName(appointment: CalendarAppointment, fallback: string) {
  return (
    appointment.patients?.full_name
    || [appointment.patients?.first_name, appointment.patients?.last_name]
      .filter(Boolean)
      .join(' ')
    || fallback
  )
}

function serviceName(appointment: CalendarAppointment, fallback: string) {
  return appointment.title || appointment.services?.name || fallback
}

function indicatorColor(appointment: CalendarAppointment) {
  return (
    appointment.color
    || appointment.services?.color
    || appointment.patients?.color
    || '#6d4bd8'
  )
}

export function MobileMonthCalendar({
  appointments,
  config,
  selectedDate,
  onSelectDate,
  onSelectAppointment,
  onNavigateMonth,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: MobileMonthCalendarProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const today = businessToday(config.timezone)
  const cells = useMemo(
    () => buildMonthCells({
      month: selectedDate,
      today,
      selectedDate,
      appointments,
    }),
    [appointments, selectedDate, today],
  )
  const selectedAppointments = useMemo(
    () => appointments
      .filter((appointment) => appointment.appointment_date === selectedDate)
      .sort((left, right) => (
        left.start_time.localeCompare(right.start_time)
        || left.id.localeCompare(right.id)
      )),
    [appointments, selectedDate],
  )
  const weekdays = cells.slice(0, 7).map((cell) => (
    formatBusinessDate(cell.date, dateLocale, { weekday: 'narrow' })
  ))

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    onNavigateMonth(deltaX < 0 ? 1 : -1)
  }

  return (
    <section
      data-testid="mobile-month-calendar"
      className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-card"
    >
      <CalendarToolbar
        selectedDate={selectedDate}
        view="month"
        enabledViews={['day', 'week', 'month', 'agenda']}
        onToday={() => onSelectDate(today)}
        onViewChange={onViewChange}
        onOptimize={onOptimize}
        optimizeButtonRef={optimizeButtonRef}
      />

      <div
        data-testid="month-grid"
        className="touch-pan-y border-y border-border"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="grid grid-cols-7 bg-muted/35" aria-hidden="true">
          {weekdays.map((weekday, index) => (
            <span
              key={`${weekday}-${index}`}
              className="py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground"
            >
              {weekday}
            </span>
          ))}
        </div>
        <div role="grid" className="grid grid-cols-7">
          {cells.map((cell) => (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              aria-selected={cell.isSelected}
              aria-label={formatBusinessDate(cell.date, dateLocale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              className={cn(
                'relative min-h-[4.5rem] border-b border-r border-border/70 p-1 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                !cell.inMonth && 'bg-muted/20 text-muted-foreground/60',
                cell.isSelected && 'bg-primary/10 ring-2 ring-inset ring-primary',
                cell.isToday && !cell.isSelected && 'bg-accent',
              )}
              onClick={() => {
                if (cell.isSelected) {
                  onViewChange('day')
                } else {
                  onSelectDate(cell.date)
                }
              }}
            >
              <span
                className={cn(
                  'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold',
                  cell.isToday && 'bg-primary text-primary-foreground',
                  cell.isSelected && !cell.isToday && 'text-primary',
                )}
              >
                {formatBusinessDate(cell.date, dateLocale, { day: 'numeric' })}
              </span>
              <span className="mt-1 block space-y-1">
                {cell.visibleIndicators.map((appointment) => (
                  <span
                    key={appointment.id}
                    className="block h-1.5 rounded-full"
                    style={{ backgroundColor: indicatorColor(appointment) }}
                  />
                ))}
                {cell.hiddenCount > 0 ? (
                  <span className="block truncate text-[9px] font-semibold text-muted-foreground">
                    {t('cal.moreAppointments', { n: cell.hiddenCount })}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        data-testid="month-mini-agenda"
        className="max-h-[15rem] overflow-y-auto"
      >
        <h2 className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-sm font-bold capitalize">
          {formatBusinessDate(selectedDate, dateLocale, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <div className="divide-y divide-border">
          {selectedAppointments.map((appointment) => {
            const patient = patientName(appointment, t('dash.client'))
            const service = serviceName(appointment, t('dash.appointment'))
            const status = t(`cal.status.${appointment.status}`)

            return (
              <button
                key={appointment.id}
                type="button"
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={[
                  fmtTime(appointment.start_time),
                  patient,
                  service,
                  status,
                ].join(', ')}
                onClick={() => onSelectAppointment(appointment.id)}
              >
                <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {fmtTime(appointment.start_time)}
                </span>
                <span
                  aria-hidden="true"
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: indicatorColor(appointment) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {patient}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {service} · {status}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
