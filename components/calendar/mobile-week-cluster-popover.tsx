'use client'

import {
  useState,
  type ComponentType,
  type HTMLAttributes,
  type MouseEvent,
} from 'react'

import { fmtTime, type CalendarAppointment } from '@/lib/api/appointments'
import { useT } from '@/lib/i18n/use-t'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const ClusterPopoverContent = PopoverContent as unknown as ComponentType<
  HTMLAttributes<HTMLDivElement> & {
    align?: 'start' | 'center' | 'end'
  }
>

interface MobileWeekClusterPopoverProps {
  appointments: CalendarAppointment[]
  top: number
  onSelectAppointment(id: string): void
}

function clientName(appointment: CalendarAppointment, fallback: string) {
  return (
    appointment.patients?.full_name
    || [
      appointment.patients?.first_name,
      appointment.patients?.last_name,
    ].filter(Boolean).join(' ')
    || fallback
  )
}

export function MobileWeekClusterPopover({
  appointments,
  top,
  onSelectAppointment,
}: MobileWeekClusterPopoverProps) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  if (appointments.length === 0) return null

  return (
    <div
      className="absolute right-0 z-30"
      style={{ top }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('cal.moreAppointments', {
              n: appointments.length,
            })}
            className="flex h-7 min-w-7 items-center justify-center rounded-bl-md rounded-tr-md border border-border bg-background/95 px-1 text-[10px] font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{appointments.length}
          </button>
        </PopoverTrigger>
        <ClusterPopoverContent
          align="end"
          className="w-56 space-y-1 p-2"
          onClick={(event: MouseEvent<HTMLDivElement>) => (
            event.stopPropagation()
          )}
        >
          {appointments.map((appointment) => {
            const client = clientName(appointment, t('dash.client'))
            const time = fmtTime(appointment.start_time)
            return (
              <button
                key={appointment.id}
                type="button"
                aria-label={`${time}, ${client}`}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setOpen(false)
                  onSelectAppointment(appointment.id)
                }}
              >
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {time}
                </span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {client}
                </span>
              </button>
            )
          })}
        </ClusterPopoverContent>
      </Popover>
    </div>
  )
}
