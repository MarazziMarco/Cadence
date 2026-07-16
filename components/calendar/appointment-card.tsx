'use client'

import { memo, useMemo, type RefObject } from 'react'

import {
  fmtTime,
  timeToMin,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import { minutesToY } from '@/lib/calendar/geometry'
import type { MoveIntent, ResizeIntent } from '@/lib/calendar/types'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils'
import { useCalendarGesture } from '@/hooks/use-calendar-gesture'

interface AppointmentCardProps {
  appointment: CalendarAppointment
  top: number
  height: number
  leftPercent?: number
  widthPercent?: number
  rangeStart: number
  rangeEnd: number
  density: number
  snapIntervalMinutes: number
  scrollRef: RefObject<HTMLElement | null>
  gestureDisabled?: boolean
  onGestureActiveChange?(active: boolean): void
  onSelect(id: string): void
  onMove(request: MoveIntent): void
  onResize(request: ResizeIntent): void
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

function AppointmentCardComponent({
  appointment,
  top,
  height,
  leftPercent = 0,
  widthPercent = 100,
  rangeStart,
  rangeEnd,
  density,
  snapIntervalMinutes,
  scrollRef,
  gestureDisabled,
  onGestureActiveChange,
  onSelect,
  onMove,
  onResize,
}: AppointmentCardProps) {
  const { t } = useT()
  const client = patientName(appointment, t('dash.client'))
  const service = serviceName(appointment, t('dash.appointment'))
  const status = t(`cal.status.${appointment.status}`)
  const color = (
    appointment.color
    || appointment.services?.color
    || appointment.patients?.color
    || '#6d4bd8'
  )
  const accessibleName = useMemo(
    () => [
      fmtTime(appointment.start_time),
      client,
      service,
      t('onb.minutes', { m: appointment.duration_minutes }),
      status,
    ].join(', '),
    [
      appointment.duration_minutes,
      appointment.start_time,
      client,
      service,
      status,
      t,
    ],
  )
  const gesture = useCalendarGesture({
    appointmentId: appointment.id,
    expectedVersion: appointment.version,
    date: appointment.appointment_date,
    startMinute: timeToMin(appointment.start_time),
    durationMinutes: appointment.duration_minutes,
    rangeStart,
    rangeEnd,
    density,
    snapIntervalMinutes,
    scrollRef,
    disabled: gestureDisabled,
    onActiveChange: onGestureActiveChange,
    onMove,
    onResize,
  })
  const previewTop = gesture.preview
    ? minutesToY(gesture.preview.startMinute, rangeStart, density)
    : top
  const previewHeight = gesture.preview
    ? Math.max(
        44,
        minutesToY(gesture.preview.durationMinutes, 0, density),
      )
    : height

  return (
    <div
      className={cn(
        'absolute z-20 rounded-lg shadow-sm',
        gesture.state.phase === 'active' && 'z-40 scale-[1.02] shadow-lg',
      )}
      style={{
        top: previewTop,
        height: previewHeight,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        touchAction: gesture.touchAction,
      }}
    >
      <button
        type="button"
        aria-label={accessibleName}
        className={cn(
          'h-full w-full overflow-hidden rounded-lg border-l-[3px] px-2.5 py-1.5 text-left',
          'min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        style={{
          backgroundColor: `${color}1a`,
          borderColor: color,
          touchAction: gesture.touchAction,
        }}
        {...gesture.cardHandlers}
        onClick={(event) => {
          event.stopPropagation()
          if (!gesture.consumeClickSuppression()) onSelect(appointment.id)
        }}
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-foreground">
            {client}
          </span>
          <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
            {fmtTime(appointment.start_time)}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight">
          <span className="truncate text-muted-foreground">{service}</span>
          <span aria-hidden="true" className="text-muted-foreground/60">·</span>
          <span className="shrink-0 text-muted-foreground">
            {gesture.preview?.durationMinutes
              ?? appointment.duration_minutes}m
          </span>
        </span>
        <span className="mt-1 inline-flex rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground ring-1 ring-border/70">
          {status}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Resize ${client} appointment`}
        className="absolute bottom-0 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-end justify-center pb-1"
        style={{ touchAction: gesture.touchAction }}
        {...gesture.resizeHandlers}
        onClick={(event) => event.stopPropagation()}
      >
        <span
          aria-hidden="true"
          className="h-1 w-10 rounded-full bg-foreground/35"
        />
      </button>
      <span aria-live="polite" className="sr-only">
        {gesture.liveValue}
      </span>
    </div>
  )
}

export const AppointmentCard = memo(AppointmentCardComponent)
