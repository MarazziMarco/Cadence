'use client'

import { useEffect, useMemo, useRef, useState, type Ref } from 'react'

import { timeToMin, type CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  weekRange,
} from '@/lib/calendar/date'
import { minutesToY, yToMinutes } from '@/lib/calendar/geometry'
import { allocateTemporalOverlapLanes } from '@/lib/calendar/overlap-lanes'
import type { CalendarView, MoveIntent, ResizeIntent } from '@/lib/calendar/types'
import {
  selectedDayScrollLeft,
  weekColumnWidth,
} from '@/lib/calendar/week-layout'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { useWeekHeaderPinch } from '@/hooks/use-week-header-pinch'
import { AppointmentCard } from './appointment-card'
import { CalendarToolbar } from './calendar-toolbar'
import { CalendarZoomControls } from './calendar-zoom-controls'

interface MobileWeekTimeGridProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  density: number
  onSelectDate(date: string): void
  onSelectAppointment(id: string): void
  onCreateAt(date: string, startMinute: number): void
  onMove(request: MoveIntent): void
  onResize(request: ResizeIntent): void
  onDensityChange(density: number): void
  onViewChange(view: CalendarView): void
  onOptimize?(): void
  optimizeButtonRef?: Ref<HTMLButtonElement>
}

const RAIL = 46
const START = 7 * 60
const END = 21 * 60

export function MobileWeekTimeGrid({
  appointments,
  config,
  selectedDate,
  density,
  onSelectDate,
  onSelectAppointment,
  onCreateAt,
  onMove,
  onResize,
  onDensityChange,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: MobileWeekTimeGridProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { from } = weekRange(selectedDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addBusinessDays(from, index)),
    [from],
  )
  const [visibleDays, setVisibleDays] = useState(7)
  const [width, setWidth] = useState(390)
  const today = businessToday(config.timezone)

  useEffect(() => setVisibleDays(7), [from])
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const update = () => setWidth(node.clientWidth || 390)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const columnWidth = weekColumnWidth(Math.max(1, width - RAIL), visibleDays)
  const contentWidth = RAIL + columnWidth * 7
  const selectedIndex = Math.max(0, days.indexOf(selectedDate))
  const pinch = useWeekHeaderPinch({
    visibleDays,
    onVisibleDaysChange: setVisibleDays,
  })

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const frame = requestAnimationFrame(() => {
      node.scrollLeft = selectedDayScrollLeft({
        containerWidth: width,
        columnWidth,
        selectedIndex,
        dayCount: 7,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [columnWidth, selectedIndex, width])

  const hours = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => (
    START + i * 60
  ))
  const height = minutesToY(END, START, density)

  return (
    <section
      data-testid="mobile-week-time-grid"
      data-visible-days={visibleDays}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <CalendarToolbar
        selectedDate={selectedDate}
        view="week"
        enabledViews={['day', 'week', 'month', 'agenda']}
        onToday={() => onSelectDate(today)}
        onViewChange={onViewChange}
        onOptimize={onOptimize}
        optimizeButtonRef={optimizeButtonRef}
      />
      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
        <div style={{ width: contentWidth }}>
          <div
            data-testid="week-pinch-header"
            className="sticky top-0 z-30 grid border-y border-border bg-card touch-pan-x"
            style={{
              gridTemplateColumns: `${RAIL}px repeat(7, ${columnWidth}px)`,
            }}
            {...pinch.handlers}
          >
            <span />
            {days.map((date) => (
              <button
                key={date}
                type="button"
                data-testid="week-day-header"
                aria-current={date === selectedDate ? 'date' : undefined}
                className="min-h-11 border-l border-border px-1 py-2 text-center"
                onClick={() => onSelectDate(date)}
              >
                <span className="block text-[10px] font-semibold uppercase">
                  {formatBusinessDate(date, dateLocale, { weekday: 'short' })}
                </span>
                <span className={date === today
                  ? 'mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground'
                  : 'mt-1 block text-xs font-bold'}
                >
                  {formatBusinessDate(date, dateLocale, { day: 'numeric' })}
                </span>
              </button>
            ))}
          </div>
          <div
            className="grid"
            style={{
              height,
              gridTemplateColumns: `${RAIL}px repeat(7, ${columnWidth}px)`,
            }}
          >
            <div className="relative border-r border-border bg-muted/20">
              {hours.map((minute) => (
                <span
                  key={minute}
                  className="absolute right-1 -translate-y-1/2 text-[9px] text-muted-foreground"
                  style={{ top: minutesToY(minute, START, density) }}
                >
                  {String(Math.floor(minute / 60)).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {days.map((date) => {
              const layouts = allocateTemporalOverlapLanes(
                appointments
                  .filter((appointment) => appointment.appointment_date === date)
                  .map((appointment) => {
                    const top = minutesToY(
                      timeToMin(appointment.start_time),
                      START,
                      density,
                    )
                    const temporalHeight = minutesToY(
                      appointment.duration_minutes,
                      0,
                      density,
                    )
                    return {
                      appointment,
                      id: appointment.id,
                      top,
                      height: Math.max(44, temporalHeight),
                      temporalEnd: top + temporalHeight,
                    }
                  }),
              )
              return (
                <div
                  key={date}
                  data-date={date}
                  data-testid="week-day-column"
                  className="relative border-r border-border"
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect()
                    onCreateAt(date, yToMinutes(
                      event.clientY - bounds.top,
                      START,
                      density,
                      config.slotIntervalMinutes,
                    ))
                  }}
                >
                  {hours.map((minute) => (
                    <span
                      key={minute}
                      aria-hidden
                      className="absolute inset-x-0 border-t border-border/60"
                      style={{ top: minutesToY(minute, START, density) }}
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
                      rangeStart={START}
                      rangeEnd={END}
                      density={density}
                      snapIntervalMinutes={config.slotIntervalMinutes}
                      scrollRef={scrollRef}
                      gestureDisabled={false}
                      onGestureActiveChange={() => {}}
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
      </div>
      <CalendarZoomControls
        density={density}
        onDensityChange={onDensityChange}
      />
    </section>
  )
}
