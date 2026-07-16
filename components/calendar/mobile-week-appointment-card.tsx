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
import { useWeekAppointmentGesture } from '@/hooks/use-week-appointment-gesture'

export interface WeekAppointmentGestureBindings {
  state: ReturnType<typeof useWeekAppointmentGesture>['state']
  touchAction: ReturnType<typeof useWeekAppointmentGesture>['touchAction']
  liveValue: ReturnType<typeof useWeekAppointmentGesture>['liveValue']
  cardHandlers: ReturnType<typeof useWeekAppointmentGesture>['cardHandlers']
  consumeClickSuppression(): boolean
}

export interface MobileWeekAppointmentCardProps {
  appointment: CalendarAppointment
  top: number
  height: number
  leftPercent: number
  widthPercent: number
  showService: boolean
  horizontalOffset?: number
  onSelect(id: string): void
  gesture: WeekAppointmentGestureBindings
}

interface MobileWeekAppointmentWithGestureProps extends Omit<
  MobileWeekAppointmentCardProps,
  'gesture'
> {
  rangeStart: number
  rangeEnd: number
  density: number
  snapIntervalMinutes: number
  dates: string[]
  railWidth: number
  columnWidth: number
  scrollRef: RefObject<HTMLElement | null>
  gestureDisabled?: boolean
  onGestureActiveChange?(active: boolean): void
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

function MobileWeekAppointmentCardComponent({
  appointment,
  top,
  height,
  leftPercent,
  widthPercent,
  showService,
  horizontalOffset = 0,
  onSelect,
  gesture,
}: MobileWeekAppointmentCardProps) {
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

  return (
    <div
      className={cn(
        'absolute z-20 rounded-md shadow-sm',
        gesture.state.phase === 'active' && 'z-40 scale-[1.02] shadow-lg',
      )}
      style={{
        top,
        height,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        transform: horizontalOffset === 0
          ? undefined
          : `translateX(${horizontalOffset}px) scale(1.02)`,
        touchAction: gesture.touchAction,
      }}
    >
      <button
        type="button"
        data-appointment-id={appointment.id}
        aria-label={accessibleName}
        className={cn(
          'h-full min-h-11 w-full overflow-hidden rounded-md border-l-[2px] px-1 py-0.5 text-left',
          'motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
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
        <span className="block truncate text-[9px] font-semibold leading-tight tabular-nums text-muted-foreground">
          {fmtTime(appointment.start_time)}
        </span>
        <span className="block truncate text-[10px] font-semibold leading-tight text-foreground">
          {client}
        </span>
        {showService ? (
          <span className="block truncate text-[9px] leading-tight text-muted-foreground">
            {service}
          </span>
        ) : null}
      </button>
      <span aria-live="polite" className="sr-only">
        {gesture.liveValue}
      </span>
    </div>
  )
}

export const MobileWeekAppointmentCard = memo(
  MobileWeekAppointmentCardComponent,
)

export function MobileWeekAppointmentWithGesture({
  appointment,
  top,
  height,
  leftPercent,
  widthPercent,
  showService,
  rangeStart,
  rangeEnd,
  density,
  snapIntervalMinutes,
  dates,
  railWidth,
  columnWidth,
  scrollRef,
  gestureDisabled,
  onGestureActiveChange,
  onSelect,
  onMove,
  onResize,
}: MobileWeekAppointmentWithGestureProps) {
  const gesture = useWeekAppointmentGesture({
    appointmentId: appointment.id,
    expectedVersion: appointment.version,
    date: appointment.appointment_date,
    startMinute: timeToMin(appointment.start_time),
    durationMinutes: appointment.duration_minutes,
    rangeStart,
    rangeEnd,
    density,
    snapIntervalMinutes,
    dates,
    railWidth,
    columnWidth,
    scrollRef,
    disabled: gestureDisabled,
    onActiveChange: onGestureActiveChange,
    onMove,
  })
  const previewTop = gesture.preview
    ? minutesToY(gesture.preview.startMinute, rangeStart, density)
    : top
  const sourceDateIndex = dates.indexOf(appointment.appointment_date)
  const previewDateIndex = gesture.preview
    ? dates.indexOf(gesture.preview.date)
    : sourceDateIndex
  const horizontalOffset = (
    sourceDateIndex >= 0 && previewDateIndex >= 0
      ? (previewDateIndex - sourceDateIndex) * columnWidth
      : 0
  )

  return (
    <MobileWeekAppointmentCard
      appointment={appointment}
      top={previewTop}
      height={height}
      leftPercent={leftPercent}
      widthPercent={widthPercent}
      showService={showService}
      horizontalOffset={horizontalOffset}
      onSelect={onSelect}
      gesture={gesture}
    />
  )
}
