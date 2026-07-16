'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
} from 'react'

import {
  timeToMin,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  businessToday,
  formatBusinessDate,
} from '@/lib/calendar/date'
import {
  minutesToY,
  yToMinutes,
} from '@/lib/calendar/geometry'
import type { CalendarRendererProps } from '@/components/calendar/desktop-week-calendar'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { WEEKDAYS } from '@/lib/types/db'
import { AppointmentCard } from './appointment-card'
import { CalendarToolbar } from './calendar-toolbar'
import { MobileDateStrip } from './mobile-date-strip'

const FALLBACK_START_MINUTE = 8 * 60
const FALLBACK_END_MINUTE = 18 * 60
const ignoreViewChange = () => {}

interface MobileDayCalendarProps extends CalendarRendererProps {
  isLoading?: boolean
  onOptimize?(): void
}

interface OpenWindow {
  start: number
  end: number
}

interface DaySchedule {
  isClosed: boolean
  rangeStart: number
  rangeEnd: number
  closedWindows: OpenWindow[]
}

function weekdayForDate(date: string) {
  const weekdayIndex = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  return WEEKDAYS[(weekdayIndex + 6) % 7]
}

function validWindow(start: string | null, end: string | null): OpenWindow | null {
  if (!start || !end) return null
  const startMinute = timeToMin(start)
  const endMinute = timeToMin(end)
  return endMinute > startMinute
    ? { start: startMinute, end: endMinute }
    : null
}

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

function isHolidayClosed(config: CalendarConfig, date: string) {
  return config.holidays.some((holiday) => (
    holiday.is_closed
    && holiday.start_date <= date
    && holiday.end_date >= date
  ))
}

function complementWindows(
  rangeStart: number,
  rangeEnd: number,
  windows: OpenWindow[],
) {
  const result: OpenWindow[] = []
  let cursor = rangeStart

  for (const window of windows) {
    const start = Math.max(rangeStart, window.start)
    const end = Math.min(rangeEnd, window.end)
    if (end <= rangeStart || start >= rangeEnd) continue
    if (start > cursor) result.push({ start: cursor, end: start })
    cursor = Math.max(cursor, end)
  }

  if (cursor < rangeEnd) result.push({ start: cursor, end: rangeEnd })
  return result
}

function daySchedule(
  config: CalendarConfig,
  selectedDate: string,
  appointments: CalendarAppointment[],
): DaySchedule {
  const hours = config.workingHours.find(
    (workingHour) => workingHour.weekday === weekdayForDate(selectedDate),
  )
  const closedByHoliday = isHolidayClosed(config, selectedDate)
  const openWindows = (
    hours?.is_open && !closedByHoliday
      ? [
          validWindow(hours.morning_start, hours.morning_end),
          validWindow(hours.afternoon_start, hours.afternoon_end),
        ].filter((window): window is OpenWindow => window !== null)
      : []
  ).sort((left, right) => left.start - right.start)
  const appointmentStart = appointments.length
    ? Math.min(...appointments.map((appointment) => timeToMin(appointment.start_time)))
    : null
  const appointmentEnd = appointments.length
    ? Math.max(...appointments.map((appointment) => timeToMin(appointment.end_time)))
    : null
  const baseStart = openWindows[0]?.start ?? FALLBACK_START_MINUTE
  const baseEnd = openWindows.at(-1)?.end ?? FALLBACK_END_MINUTE
  const rangeStart = Math.floor(
    Math.min(baseStart, appointmentStart ?? baseStart) / 60,
  ) * 60
  const rangeEnd = Math.ceil(
    Math.max(baseEnd, appointmentEnd ?? baseEnd) / 60,
  ) * 60
  const isClosed = closedByHoliday || !hours?.is_open || openWindows.length === 0

  return {
    isClosed,
    rangeStart,
    rangeEnd,
    closedWindows: isClosed
      ? [{ start: rangeStart, end: rangeEnd }]
      : complementWindows(rangeStart, rangeEnd, openWindows),
  }
}

function hourLabel(minute: number) {
  const hour = Math.floor(minute / 60)
  const value = minute % 60
  return `${String(hour).padStart(2, '0')}:${String(value).padStart(2, '0')}`
}

export function MobileDayCalendar({
  appointments,
  config,
  selectedDate,
  density,
  isLoading = false,
  onSelectDate,
  onSelectAppointment,
  onCreateAt,
  onOptimize,
}: MobileDayCalendarProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const scrolledDatesRef = useRef(new Set<string>())
  const selectedAppointments = useMemo(
    () => appointments
      .filter((appointment) => appointment.appointment_date === selectedDate)
      .sort((left, right) => left.start_time.localeCompare(right.start_time)),
    [appointments, selectedDate],
  )
  const schedule = useMemo(
    () => daySchedule(config, selectedDate, selectedAppointments),
    [config, selectedAppointments, selectedDate],
  )
  const totalHeight = minutesToY(
    schedule.rangeEnd,
    schedule.rangeStart,
    density,
  )
  const today = businessToday(config.timezone)
  const currentMinute = businessMinute(config.timezone)
  const showCurrentTime = (
    selectedDate === today
    && currentMinute >= schedule.rangeStart
    && currentMinute <= schedule.rangeEnd
  )
  const hourMarks = useMemo(() => {
    const values: number[] = []
    for (
      let minute = schedule.rangeStart;
      minute <= schedule.rangeEnd;
      minute += 60
    ) {
      values.push(minute)
    }
    return values
  }, [schedule.rangeEnd, schedule.rangeStart])
  const handleToday = useCallback(() => {
    onSelectDate(today)
  }, [onSelectDate, today])

  useEffect(() => {
    const scrollContainer = timelineScrollRef.current
    if (
      !scrollContainer
      || isLoading
      || scrolledDatesRef.current.has(selectedDate)
      || typeof scrollContainer.scrollTo !== 'function'
    ) return

    scrolledDatesRef.current.add(selectedDate)
    const targetMinute = showCurrentTime
      ? currentMinute
      : selectedAppointments[0]
        ? timeToMin(selectedAppointments[0].start_time)
        : schedule.rangeStart
    const targetTop = Math.max(
      0,
      minutesToY(targetMinute, schedule.rangeStart, density) - 96,
    )
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    scrollContainer.scrollTo({
      top: targetTop,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [
    currentMinute,
    density,
    isLoading,
    schedule.rangeStart,
    selectedAppointments,
    selectedDate,
    showCurrentTime,
  ])

  function handleTimelineClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const minute = yToMinutes(
      event.clientY - rect.top,
      schedule.rangeStart,
      density,
      config.slotIntervalMinutes,
    )
    const latestStart = Math.max(
      schedule.rangeStart,
      schedule.rangeEnd - config.defaultDurationMinutes,
    )
    onCreateAt(
      selectedDate,
      Math.max(schedule.rangeStart, Math.min(minute, latestStart)),
    )
  }

  return (
    <section
      data-testid="mobile-day-calendar"
      aria-label={formatBusinessDate(selectedDate, dateLocale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}
      className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-card"
    >
      <CalendarToolbar
        selectedDate={selectedDate}
        view="day"
        onToday={handleToday}
        onViewChange={ignoreViewChange}
        onOptimize={onOptimize}
      />
      <MobileDateStrip
        selectedDate={selectedDate}
        timezone={config.timezone}
        onSelectDate={onSelectDate}
      />

      {schedule.isClosed ? (
        <p className="border-b border-border bg-muted/60 px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
          {t('cal.closed')}
        </p>
      ) : null}

      <div
        ref={timelineScrollRef}
        className="max-h-[calc(100dvh-16rem)] overflow-x-hidden overflow-y-auto overscroll-y-contain"
      >
        <div
          className="grid grid-cols-[3.25rem_minmax(0,1fr)]"
          style={{ height: totalHeight }}
        >
          <div className="relative border-r border-border bg-muted/20">
            {hourMarks.map((minute) => (
              <span
                key={minute}
                className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-muted-foreground"
                style={{
                  top: minutesToY(minute, schedule.rangeStart, density),
                }}
              >
                {hourLabel(minute)}
              </span>
            ))}
          </div>

          <div
            data-testid="mobile-day-timeline"
            className="relative touch-manipulation overflow-hidden"
            style={{ height: totalHeight }}
            onClick={handleTimelineClick}
          >
            {hourMarks.map((minute) => (
              <div
                key={minute}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-border/60"
                style={{
                  top: minutesToY(minute, schedule.rangeStart, density),
                }}
              />
            ))}

            {schedule.closedWindows.map((window) => (
              <div
                key={`${window.start}-${window.end}`}
                data-testid={`closed-window-${window.start}-${window.end}`}
                aria-hidden="true"
                className="absolute inset-x-0 bg-muted/45 [background-image:repeating-linear-gradient(135deg,transparent,transparent_8px,hsl(var(--border)/.35)_8px,hsl(var(--border)/.35)_9px)]"
                style={{
                  top: minutesToY(
                    window.start,
                    schedule.rangeStart,
                    density,
                  ),
                  height: minutesToY(window.end, window.start, density),
                }}
              />
            ))}

            {selectedAppointments.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                top={minutesToY(
                  timeToMin(appointment.start_time),
                  schedule.rangeStart,
                  density,
                )}
                height={Math.max(
                  44,
                  minutesToY(
                    appointment.duration_minutes,
                    0,
                    density,
                  ),
                )}
                onSelect={onSelectAppointment}
              />
            ))}

            {showCurrentTime ? (
              <div
                role="separator"
                aria-label={t('cal.currentTime')}
                className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-destructive"
                style={{
                  top: minutesToY(
                    currentMinute,
                    schedule.rangeStart,
                    density,
                  ),
                }}
              >
                <span className="absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-destructive" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
