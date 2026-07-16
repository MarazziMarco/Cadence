'use client'

import { useMemo, useRef, useState, type Ref } from 'react'

import { timeToMin, type CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import { summarizeDayCapacity } from '@/lib/calendar/controller'
import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  weekRange,
} from '@/lib/calendar/date'
import { minutesToY, yToMinutes } from '@/lib/calendar/geometry'
import { allocateOverlapLanes } from '@/lib/calendar/overlap-lanes'
import type { MoveIntent, ResizeIntent } from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { usePinchZoom } from '@/hooks/use-pinch-zoom'
import { AppointmentCard } from './appointment-card'
import { CalendarToolbar } from './calendar-toolbar'
import { CalendarZoomControls } from './calendar-zoom-controls'

interface TabletMultiDayCalendarProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  density: number
  dayCount: 3 | 7
  view: 'day' | 'week'
  onSelectDate(date: string): void
  onSelectAppointment(id: string): void
  onCreateAt(date: string, startMinute: number): void
  onMove(request: MoveIntent): void
  onResize(request: ResizeIntent): void
  onDensityChange(density: number): void
  onViewChange(view: 'day' | 'week'): void
  onOptimize?(): void
  optimizeButtonRef?: Ref<HTMLButtonElement>
}

const FALLBACK_START = 8 * 60
const FALLBACK_END = 18 * 60

export function TabletMultiDayCalendar({
  appointments,
  config,
  selectedDate,
  density,
  dayCount,
  view,
  onSelectDate,
  onSelectAppointment,
  onCreateAt,
  onMove,
  onResize,
  onDensityChange,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: TabletMultiDayCalendarProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [gestureActive, setGestureActive] = useState(false)
  const pinch = usePinchZoom({
    density,
    disabled: gestureActive,
    scrollRef,
    onDensityChange,
  })
  const days = useMemo(() => {
    const start = dayCount === 7 ? weekRange(selectedDate).from : selectedDate
    return Array.from(
      { length: dayCount },
      (_, index) => addBusinessDays(start, index),
    )
  }, [dayCount, selectedDate])
  const visibleAppointments = appointments.filter(
    (appointment) => days.includes(appointment.appointment_date),
  )
  const rangeStart = Math.floor(Math.min(
    FALLBACK_START,
    ...visibleAppointments.map(
      (appointment) => timeToMin(appointment.start_time),
    ),
  ) / 60) * 60
  const rangeEnd = Math.ceil(Math.max(
    FALLBACK_END,
    ...visibleAppointments.map(
      (appointment) => timeToMin(appointment.end_time),
    ),
  ) / 60) * 60
  const height = minutesToY(rangeEnd, rangeStart, density)
  const hours = Array.from(
    { length: (rangeEnd - rangeStart) / 60 + 1 },
    (_, index) => rangeStart + index * 60,
  )

  return (
    <section
      data-testid={`tablet-${dayCount}-day-calendar`}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <CalendarToolbar
        selectedDate={selectedDate}
        view={view}
        enabledViews={['day', 'week']}
        onToday={() => onSelectDate(businessToday(config.timezone))}
        onViewChange={(view) => onViewChange(view as 'day' | 'week')}
        onOptimize={onOptimize}
        optimizeButtonRef={optimizeButtonRef}
      />
      <div
        className="grid border-y border-border bg-muted/20"
        style={{
          gridTemplateColumns: `3.25rem repeat(${dayCount}, minmax(0, 1fr))`,
        }}
      >
        <span />
        {days.map((date) => {
          const summary = summarizeDayCapacity({
            date,
            appointments,
            config,
          })
          return (
            <button
              key={date}
              type="button"
              className="min-h-11 border-l border-border px-1 py-2 text-center"
              onClick={() => onSelectDate(date)}
            >
              <span className="block text-xs font-semibold capitalize">
                {formatBusinessDate(date, dateLocale, { weekday: 'short' })}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {summary.appointmentCount} · {summary.closed
                  ? t('cal.closed')
                  : `${(summary.bookedMinutes / 60).toFixed(1)}h`}
              </span>
            </button>
          )
        })}
      </div>
      <div className="relative">
        <div
          ref={scrollRef}
          className="max-h-[calc(100dvh-15rem)] touch-pan-y overflow-y-auto"
          {...pinch.handlers}
        >
          <div
            className="grid"
            style={{
              height,
              gridTemplateColumns: `3.25rem repeat(${dayCount}, minmax(0, 1fr))`,
            }}
          >
            <div className="relative border-r border-border bg-muted/20">
              {hours.map((minute) => (
                <span
                  key={minute}
                  className="absolute right-1 -translate-y-1/2 text-[9px] text-muted-foreground"
                  style={{ top: minutesToY(minute, rangeStart, density) }}
                >
                  {String(Math.floor(minute / 60)).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {days.map((date) => {
              const dayAppointments = visibleAppointments.filter(
                (appointment) => appointment.appointment_date === date,
              )
              const layouts = allocateOverlapLanes(dayAppointments.map(
                (appointment) => ({
                  appointment,
                  id: appointment.id,
                  top: minutesToY(
                    timeToMin(appointment.start_time),
                    rangeStart,
                    density,
                  ),
                  height: Math.max(
                    44,
                    minutesToY(appointment.duration_minutes, 0, density),
                  ),
                }),
              ))
              return (
                <div
                  key={date}
                  data-date={date}
                  className="relative border-r border-border"
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect()
                    onCreateAt(
                      date,
                      yToMinutes(
                        event.clientY - bounds.top,
                        rangeStart,
                        density,
                        config.slotIntervalMinutes,
                      ),
                    )
                  }}
                >
                  {hours.map((minute) => (
                    <span
                      key={minute}
                      aria-hidden
                      className="absolute inset-x-0 border-t border-border/60"
                      style={{ top: minutesToY(minute, rangeStart, density) }}
                    />
                  ))}
                  {layouts.map((layout) => (
                    <AppointmentCard
                      key={layout.id}
                      appointment={layout.appointment}
                      top={layout.top}
                      height={layout.height}
                      leftPercent={layout.leftPercent}
                      widthPercent={layout.widthPercent}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      density={density}
                      snapIntervalMinutes={config.slotIntervalMinutes}
                      scrollRef={scrollRef}
                      gestureDisabled={pinch.isPinching}
                      onGestureActiveChange={setGestureActive}
                      onSelect={onSelectAppointment}
                      onMove={onMove}
                      onResize={onResize}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        <CalendarZoomControls
          density={density}
          onDensityChange={onDensityChange}
        />
      </div>
    </section>
  )
}
