'use client'

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react'

import { timeToMin, type CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  weekRange,
} from '@/lib/calendar/date'
import { compactClusters } from '@/lib/calendar/compact-clusters'
import { minutesToY, yToMinutes } from '@/lib/calendar/geometry'
import { allocateTemporalOverlapLanes } from '@/lib/calendar/overlap-lanes'
import type { CalendarView, MoveIntent, ResizeIntent } from '@/lib/calendar/types'
import {
  selectedDayScrollLeft,
  weekColumnWidth,
} from '@/lib/calendar/week-layout'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { WEEKDAYS } from '@/lib/types/db'
import { usePinchZoom } from '@/hooks/use-pinch-zoom'
import { useWeekHeaderPinch } from '@/hooks/use-week-header-pinch'
import { CalendarToolbar } from './calendar-toolbar'
import { CalendarZoomControls } from './calendar-zoom-controls'
import { MobileWeekAppointmentWithGesture } from './mobile-week-appointment-card'
import { MobileWeekClusterPopover } from './mobile-week-cluster-popover'

interface MobileWeekTimeGridProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  density: number
  isLoading?: boolean
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
const SERVICE_MIN_WIDTH = 72
const SERVICE_MIN_HEIGHT = 52
const APPOINTMENT_MIN_READABLE_WIDTH = 24

function businessMinute(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type === 'hour' || type === 'minute')
      .map(({ type, value }) => [type, Number(value)]),
  )
  return values.hour * 60 + values.minute
}

function weekdayForDate(date: string) {
  const weekdayIndex = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  return WEEKDAYS[(weekdayIndex + 6) % 7]
}

function validWindowStart(start: string | null, end: string | null) {
  if (!start || !end) return null
  const startMinute = timeToMin(start)
  return timeToMin(end) > startMinute ? startMinute : null
}

function firstWorkingMinute(config: CalendarConfig, days: string[]) {
  const weekdays = new Set(days.map(weekdayForDate))
  const starts = config.workingHours.flatMap((workingHour) => {
    if (!workingHour.is_open || !weekdays.has(workingHour.weekday)) return []
    return [
      validWindowStart(workingHour.morning_start, workingHour.morning_end),
      validWindowStart(workingHour.afternoon_start, workingHour.afternoon_end),
    ].filter((minute): minute is number => minute !== null)
  })
  return starts.length ? Math.min(...starts) : START
}

export function MobileWeekTimeGrid({
  appointments,
  config,
  selectedDate,
  density,
  isLoading = false,
  onSelectDate,
  onSelectAppointment,
  onCreateAt,
  onMove,
  onDensityChange,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: MobileWeekTimeGridProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const weekViewportRef = useRef<HTMLDivElement>(null)
  const weekHeaderRef = useRef<HTMLDivElement>(null)
  const lastScrolledWeekRef = useRef<string | null>(null)
  const { from } = weekRange(selectedDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addBusinessDays(from, index)),
    [from],
  )
  const [visibleDays, setVisibleDays] = useState(7)
  const [width, setWidth] = useState(390)
  const [pinchContentOffsetTop, setPinchContentOffsetTop] = useState(0)
  const [calendarGestureActive, setCalendarGestureActive] = useState(false)
  const today = businessToday(config.timezone)
  const verticalPinch = usePinchZoom({
    density,
    disabled: calendarGestureActive,
    contentOffsetTop: pinchContentOffsetTop,
    scrollRef: weekViewportRef,
    onDensityChange,
  })

  useEffect(() => setVisibleDays(7), [from])
  useEffect(() => {
    const node = weekViewportRef.current
    if (!node) return
    const header = weekHeaderRef.current
    const update = () => {
      setWidth(node.clientWidth || 390)
      setPinchContentOffsetTop(header?.offsetHeight ?? 0)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    if (header) observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const columnWidth = weekColumnWidth(Math.max(1, width - RAIL), visibleDays)
  const contentWidth = RAIL + columnWidth * 7
  const selectedIndex = Math.max(0, days.indexOf(selectedDate))
  const headerPinch = useWeekHeaderPinch({
    visibleDays,
    onVisibleDaysChange: setVisibleDays,
  })

  useEffect(() => {
    const node = weekViewportRef.current
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

  useEffect(() => {
    const node = weekViewportRef.current
    if (
      !node
      || isLoading
      || lastScrolledWeekRef.current === from
      || typeof node.scrollTo !== 'function'
    ) return

    lastScrolledWeekRef.current = from
    const weeklyAppointmentStarts = appointments
      .filter((appointment) => days.includes(appointment.appointment_date))
      .map((appointment) => timeToMin(appointment.start_time))
    const targetMinute = days.includes(today)
      ? businessMinute(config.timezone)
      : weeklyAppointmentStarts.length
        ? Math.min(...weeklyAppointmentStarts)
        : firstWorkingMinute(config, days)
    const targetTop = Math.max(
      0,
      minutesToY(targetMinute, START, density) - 96,
    )
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    node.scrollTo({
      top: targetTop,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [appointments, config, days, density, from, isLoading, today])

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
      <div className="relative">
        <div
          ref={weekViewportRef}
          data-testid="mobile-week-viewport"
          className="relative max-h-[calc(100dvh-16rem)] overflow-auto overscroll-contain [touch-action:pan-x_pan-y]"
          {...verticalPinch.handlers}
        >
          <div style={{ width: contentWidth }}>
            <div
              ref={weekHeaderRef}
              data-testid="week-pinch-header"
              data-pinch-zoom-ignore
              className="sticky top-0 z-30 grid border-y border-border bg-card touch-pan-x"
              style={{
                gridTemplateColumns: `${RAIL}px repeat(7, ${columnWidth}px)`,
              }}
              {...headerPinch.handlers}
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
                    .filter((appointment) => (
                      appointment.appointment_date === date
                    ))
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
                        ...appointment,
                        top,
                        height: Math.max(44, temporalHeight),
                        temporalEnd: top + temporalHeight,
                      }
                    }),
                )
                const compactItems = compactClusters(
                  layouts,
                  columnWidth,
                  APPOINTMENT_MIN_READABLE_WIDTH,
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
                    {compactItems.map((item) => {
                      const layout = item.kind === 'appointment'
                        ? item.layout
                        : item.layouts[0]
                      const isCluster = item.kind === 'cluster'
                      const renderedWidth = (
                        isCluster
                          ? columnWidth
                          : columnWidth * layout.widthPercent / 100
                      )
                      const showService = (
                        renderedWidth >= SERVICE_MIN_WIDTH
                        && layout.height >= SERVICE_MIN_HEIGHT
                      )
                      return (
                        <Fragment key={layout.id}>
                          <MobileWeekAppointmentWithGesture
                            appointment={layout}
                            top={layout.top}
                            height={layout.height}
                            leftPercent={isCluster ? 0 : layout.leftPercent}
                            widthPercent={isCluster ? 100 : layout.widthPercent}
                            showService={showService}
                            rangeStart={START}
                            rangeEnd={END}
                            density={density}
                            snapIntervalMinutes={config.slotIntervalMinutes}
                            dates={days}
                            railWidth={RAIL}
                            columnWidth={columnWidth}
                            scrollRef={weekViewportRef}
                            gestureDisabled={verticalPinch.isPinching}
                            onGestureActiveChange={setCalendarGestureActive}
                            onSelect={onSelectAppointment}
                            onMove={onMove}
                          />
                          {item.kind === 'cluster' ? (
                            <MobileWeekClusterPopover
                              appointments={item.layouts.slice(1)}
                              top={layout.top}
                              onSelectAppointment={onSelectAppointment}
                            />
                          ) : null}
                        </Fragment>
                      )
                    })}
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
      </div>
    </section>
  )
}
