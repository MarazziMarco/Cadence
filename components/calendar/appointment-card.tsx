'use client'

import { memo, useMemo } from 'react'

import {
  fmtTime,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils'

interface AppointmentCardProps {
  appointment: CalendarAppointment
  top: number
  height: number
  onSelect(id: string): void
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
  onSelect,
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

  return (
    <button
      type="button"
      aria-label={accessibleName}
      className={cn(
        'absolute inset-x-2 z-20 overflow-hidden rounded-lg border-l-[3px] px-2.5 py-1.5 text-left shadow-sm',
        'min-h-11 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
      style={{
        top,
        height,
        backgroundColor: `${color}1a`,
        borderColor: color,
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(appointment.id)
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
          {appointment.duration_minutes}m
        </span>
      </span>
      <span className="mt-1 inline-flex rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground ring-1 ring-border/70">
        {status}
      </span>
    </button>
  )
}

export const AppointmentCard = memo(AppointmentCardComponent)
