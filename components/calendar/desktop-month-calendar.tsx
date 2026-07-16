'use client'

import { useMemo } from 'react'

import { fmtTime, type CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import { businessToday, formatBusinessDate } from '@/lib/calendar/date'
import { buildMonthCells } from '@/lib/calendar/month'
import type { CalendarView } from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils'

interface DesktopMonthCalendarProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  onSelectDate(date: string): void
  onSelectAppointment(id: string): void
  onViewChange(view: CalendarView): void
}

export function DesktopMonthCalendar({
  appointments,
  config,
  selectedDate,
  onSelectDate,
  onSelectAppointment,
  onViewChange,
}: DesktopMonthCalendarProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const cells = useMemo(() => buildMonthCells({
    month: selectedDate,
    today: businessToday(config.timezone),
    selectedDate,
    appointments,
  }), [appointments, config.timezone, selectedDate])
  const weekdays = cells.slice(0, 7).map((cell) => (
    formatBusinessDate(cell.date, dateLocale, { weekday: 'short' })
  ))

  return (
    <section
      data-testid="desktop-month-calendar"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {weekdays.map((weekday, index) => (
          <span
            key={`${weekday}-${index}`}
            className="py-2 text-center text-xs font-semibold uppercase text-muted-foreground"
          >
            {weekday}
          </span>
        ))}
      </div>
      <div role="grid" className="grid grid-cols-7">
        {cells.map((cell) => (
          <div
            key={cell.date}
            role="gridcell"
            aria-selected={cell.isSelected}
            aria-label={formatBusinessDate(cell.date, dateLocale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
            className={cn(
              'min-h-[8rem] border-b border-r border-border/70 p-1.5 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              !cell.inMonth && 'bg-muted/20 text-muted-foreground/60',
              cell.isSelected && 'bg-primary/5 ring-2 ring-inset ring-primary',
            )}
          >
            <button
              type="button"
              className={cn(
                'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold',
                cell.isToday && 'bg-primary text-primary-foreground',
              )}
              onClick={() => {
                if (cell.isSelected) onViewChange('day')
                else onSelectDate(cell.date)
              }}
            >
              {formatBusinessDate(cell.date, dateLocale, { day: 'numeric' })}
            </button>
            <span className="mt-1 block space-y-1">
              {cell.appointments.slice(0, 4).map((appointment) => {
                const patient = appointment.patients?.full_name
                  || appointment.patients?.first_name
                  || t('dash.client')
                const service = appointment.title
                  || appointment.services?.name
                  || t('dash.appointment')
                const color = appointment.color
                  || appointment.services?.color
                  || '#6d4bd8'
                return (
                  <button
                    key={appointment.id}
                    type="button"
                    data-appointment-id={appointment.id}
                    className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold"
                    style={{
                      backgroundColor: `${color}20`,
                      borderLeft: `3px solid ${color}`,
                    }}
                    aria-label={[
                      fmtTime(appointment.start_time),
                      patient,
                      service,
                    ].join(', ')}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectAppointment(appointment.id)
                    }}
                  >
                    <span className="mr-1 tabular-nums">
                      {fmtTime(appointment.start_time)}
                    </span>
                    {patient}
                  </button>
                )
              })}
              {cell.appointments.length > 4 ? (
                <span className="block px-1 text-[10px] font-semibold text-muted-foreground">
                  {t('cal.moreAppointments', {
                    n: cell.appointments.length - 4,
                  })}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
