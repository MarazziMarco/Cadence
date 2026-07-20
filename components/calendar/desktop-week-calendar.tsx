'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  fmtTime,
  minToTime,
  timeToMin,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
  weekRange,
} from '@/lib/calendar/date'
import type { MoveIntent, ResizeIntent } from '@/lib/calendar/types'
import { allocateOverlapLanes } from '@/lib/calendar/overlap-lanes'
import { clampDensity } from '@/lib/calendar/geometry'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils'

const START_HOUR = 7
const END_HOUR = 21
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, index) => START_HOUR + index,
)

export interface CalendarRendererProps {
  appointments: CalendarAppointment[]
  config: CalendarConfig
  selectedDate: string
  density: number
  onSelectDate(date: string): void
  onSelectAppointment(id: string): void
  onCreateAt(date: string, startMinute: number): void
  onMove(request: MoveIntent): void
  onResize(request: ResizeIntent): void
}

export interface DesktopWeekCalendarProps extends CalendarRendererProps {
  view: 'day' | 'week'
  onDensityChange?(density: number): void
}

interface DragPreview {
  date: string
  startMinute: number
}

function visibleDays(selectedDate: string, view: DesktopWeekCalendarProps['view']) {
  if (view === 'day') return [selectedDate]
  const { from } = weekRange(selectedDate)
  return Array.from({ length: 7 }, (_, index) => addBusinessDays(from, index))
}

export function DesktopWeekCalendar(props: DesktopWeekCalendarProps) {
  const {
    appointments,
    config,
    selectedDate,
    density,
    onSelectAppointment,
    onCreateAt,
    onMove,
    onDensityChange,
    view,
  } = props
  const { t, locale } = useT()
  // Zoom the timeline by scrolling / two-finger over the hour gutter (desktop).
  // A native non-passive listener so preventDefault can stop the page scroll.
  const gutterRef = useRef<HTMLDivElement>(null)
  const densityRef = useRef(density)
  densityRef.current = density
  useEffect(() => {
    const el = gutterRef.current
    if (!el || !onDensityChange) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.ctrlKey ? 0.6 : 0.3 // trackpad pinch sends ctrlKey
      onDensityChange(clampDensity(densityRef.current - event.deltaY * factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onDensityChange])
  const dateLocale = bcp47(locale)
  const slotInterval = config.slotIntervalMinutes
  const days = useMemo(
    () => visibleDays(selectedDate, view),
    [selectedDate, view],
  )
  const appointmentsByDay = useMemo(() => {
    const result = new Map<string, CalendarAppointment[]>()
    for (const appointment of appointments) {
      const dayAppointments = result.get(appointment.appointment_date)
      if (dayAppointments) dayAppointments.push(appointment)
      else result.set(appointment.appointment_date, [appointment])
    }
    return result
  }, [appointments])
  const appointmentById = useMemo(
    () => new Map(appointments.map((appointment) => [appointment.id, appointment])),
    [appointments],
  )
  const [dragGrab, setDragGrab] = useState(0)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [touchDragId, setTouchDragId] = useState<string | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStart = useRef({ x: 0, y: 0 })
  const suppressClick = useRef(false)
  const today = businessToday(config.timezone)

  function startMinuteFromY(y: number, durationMinutes = slotInterval) {
    const rawMinute = START_HOUR * 60 + (y / density) * 60
    const snappedMinute = Math.round(rawMinute / slotInterval) * slotInterval
    return Math.max(
      START_HOUR * 60,
      Math.min(snappedMinute, END_HOUR * 60 - durationMinutes),
    )
  }

  function createMinuteFromY(y: number) {
    const rawMinute = START_HOUR * 60 + (y / density) * 60
    const snappedMinute = Math.floor(rawMinute / slotInterval) * slotInterval
    return Math.max(
      START_HOUR * 60,
      Math.min(snappedMinute, END_HOUR * 60 - slotInterval),
    )
  }

  function previewFromPoint(
    appointment: CalendarAppointment,
    clientX: number,
    clientY: number,
  ) {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const column = target?.closest<HTMLElement>('[data-date]')
    if (!column) return
    const date = column.dataset.date
    if (!date) return
    const rect = column.getBoundingClientRect()
    setDragPreview({
      date,
      startMinute: startMinuteFromY(
        clientY - rect.top - dragGrab,
        appointment.duration_minutes,
      ),
    })
  }

  function moveAppointment(
    appointment: CalendarAppointment,
    date: string,
    startMinute: number,
  ) {
    if (
      date === appointment.appointment_date
      && startMinute === timeToMin(appointment.start_time)
    ) return

    onMove({
      appointmentId: appointment.id,
      expectedVersion: appointment.version,
      date,
      startMinute,
    })
  }

  function handleDrop(event: React.DragEvent<HTMLElement>, date: string) {
    event.preventDefault()
    setDragPreview(null)
    const appointment = appointmentById.get(
      event.dataTransfer.getData('text/appt'),
    )
    if (!appointment) return
    const grab = Number.parseInt(
      event.dataTransfer.getData('text/grab') || '0',
      10,
    )
    const rect = event.currentTarget.getBoundingClientRect()
    moveAppointment(
      appointment,
      date,
      startMinuteFromY(
        event.clientY - rect.top - grab,
        appointment.duration_minutes,
      ),
    )
  }

  function handleTouchStart(
    event: React.TouchEvent<HTMLElement>,
    appointment: CalendarAppointment,
  ) {
    const touch = event.touches[0]
    const rect = event.currentTarget.getBoundingClientRect()
    const grabY = touch.clientY - rect.top
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      setDragGrab(grabY)
      setTouchDragId(appointment.id)
      setDragPreview({
        date: appointment.appointment_date,
        startMinute: timeToMin(appointment.start_time),
      })
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20)
      }
    }, 300)
  }

  function handleTouchMove(
    event: React.TouchEvent<HTMLElement>,
    appointment: CalendarAppointment,
  ) {
    const touch = event.touches[0]
    if (touchDragId === appointment.id) {
      previewFromPoint(appointment, touch.clientX, touch.clientY)
      return
    }

    const dx = Math.abs(touch.clientX - touchStart.current.x)
    const dy = Math.abs(touch.clientY - touchStart.current.y)
    if ((dx > 8 || dy > 8) && longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleTouchEnd(appointment: CalendarAppointment) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (touchDragId === appointment.id && dragPreview) {
      moveAppointment(appointment, dragPreview.date, dragPreview.startMinute)
      suppressClick.current = true
      setTimeout(() => {
        suppressClick.current = false
      }, 450)
    }
    setTouchDragId(null)
    setDragPreview(null)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[880px] sm:min-w-0">
          <div className="flex border-b border-border bg-muted/30">
            <div className="w-14 shrink-0" />
            {days.map((date) => {
              const isToday = date === today
              return (
                <div
                  key={date}
                  className="flex-1 border-l border-border py-2 text-center"
                >
                  <div className="text-xs text-muted-foreground">
                    {formatBusinessDate(date, dateLocale, { weekday: 'short' })}
                  </div>
                  <div
                    className={cn(
                      'mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {formatBusinessDate(date, dateLocale, { day: 'numeric' })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex sm:max-h-[calc(100vh-16rem)] sm:overflow-y-auto">
            <div
              ref={gutterRef}
              className="w-14 shrink-0 cursor-ns-resize"
              title={t('cal.zoomHint')}
            >
              {HOURS.map((hour) => (
                <div key={hour} className="relative" style={{ height: density }}>
                  <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">
                    {String(hour).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>
            {days.map((date) => (
              <div
                key={date}
                data-date={date}
                className="relative flex-1 border-l border-border"
                style={{ height: (END_HOUR - START_HOUR) * density }}
                onDragOver={(event) => {
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  const startMinute = startMinuteFromY(
                    event.clientY - rect.top - dragGrab,
                  )
                  if (
                    dragPreview?.date !== date
                    || dragPreview.startMinute !== startMinute
                  ) {
                    setDragPreview({ date, startMinute })
                  }
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  ) {
                    setDragPreview((preview) => (
                      preview?.date === date ? null : preview
                    ))
                  }
                }}
                onDrop={(event) => handleDrop(event, date)}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  onCreateAt(
                    date,
                    createMinuteFromY(event.clientY - rect.top),
                  )
                }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border/60"
                    style={{ height: density }}
                  />
                ))}
                {allocateOverlapLanes((appointmentsByDay.get(date) ?? []).map((appointment) => ({
                  appointment,
                  id: appointment.id,
                  top: (timeToMin(appointment.start_time) - START_HOUR * 60) / 60 * density,
                  height: Math.max(30, appointment.duration_minutes / 60 * density - 3),
                }))).map((layout) => {
                  const appointment = layout.appointment
                  const top = layout.top
                  const height = layout.height
                  const color = (
                    appointment.color
                    || appointment.services?.color
                    || appointment.patients?.color
                    || '#4f46e5'
                  )
                  const name = (
                    appointment.patients?.full_name
                    || appointment.patients?.first_name
                    || t('dash.client')
                  )
                  const grabbed = touchDragId === appointment.id

                  return (
                    <div
                      key={appointment.id}
                      draggable
                      onDragStart={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect()
                        const grab = event.clientY - rect.top
                        setDragGrab(grab)
                        event.dataTransfer.setData('text/appt', appointment.id)
                        event.dataTransfer.setData('text/grab', String(grab))
                      }}
                      onDragEnd={() => setDragPreview(null)}
                      onTouchStart={(event) => handleTouchStart(event, appointment)}
                      onTouchMove={(event) => handleTouchMove(event, appointment)}
                      onTouchEnd={() => handleTouchEnd(appointment)}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!suppressClick.current) {
                          onSelectAppointment(appointment.id)
                        }
                      }}
                      className={cn(
                        'absolute cursor-grab select-none overflow-hidden rounded-md border-l-2 px-2 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing',
                        grabbed
                          && 'z-40 scale-[1.03] opacity-90 shadow-lg ring-2 ring-primary',
                      )}
                      style={{
                        top,
                        height,
                        // Split the column so overlapping appointments sit side by side.
                        left: `calc(${layout.leftPercent}% + 2px)`,
                        width: `calc(${layout.widthPercent}% - 4px)`,
                        backgroundColor: `${color}1f`,
                        borderColor: color,
                        touchAction: 'none',
                      }}
                    >
                      <p
                        className="truncate text-[13px] font-semibold leading-tight sm:text-xs"
                        style={{ color }}
                      >
                        {name}
                      </p>
                      <p className="truncate text-[11px] leading-tight text-muted-foreground">
                        {fmtTime(appointment.start_time)} ·{' '}
                        {appointment.title
                          || appointment.services?.name
                          || `${appointment.duration_minutes}m`}
                      </p>
                    </div>
                  )
                })}
                {dragPreview?.date === date ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-40"
                    style={{
                      top: (
                        (dragPreview.startMinute - START_HOUR * 60)
                        / 60
                        * density
                      ),
                    }}
                  >
                    <div className="border-t-2 border-dashed border-primary" />
                    <span className="absolute right-full top-1/2 mr-1 -translate-y-1/2 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-md">
                      {fmtTime(minToTime(dragPreview.startMinute))}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
