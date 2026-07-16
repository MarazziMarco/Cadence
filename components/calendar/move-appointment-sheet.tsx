'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  minToTime,
  timeToMin,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import {
  CalendarMutationError,
  isCalendarWarningConfirmation,
  mutateCalendarOrThrow,
} from '@/lib/api/calendar'
import { useT } from '@/lib/i18n/use-t'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface MoveAppointmentSheetProps {
  businessId: string
  open: boolean
  appointment: CalendarAppointment | null
  onOpenChange(open: boolean): void
  onMoved(appointment: CalendarAppointment): void
}

export function MoveAppointmentSheet({
  businessId,
  open,
  appointment,
  onOpenChange,
  onMoved,
}: MoveAppointmentSheetProps) {
  const { t } = useT()
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [warning, setWarning] = useState<CalendarMutationError | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open || !appointment) return
    setDate(appointment.appointment_date)
    setStart(appointment.start_time.slice(0, 5))
    setWarning(null)
    setPending(false)
  }, [appointment, open])

  if (!appointment) return null

  function request(confirmWarnings?: string[]) {
    const startMinute = timeToMin(`${start}:00`)
    return {
      businessId,
      operation: 'move' as const,
      appointmentId: appointment!.id,
      expectedVersion: appointment!.version,
      idempotencyKey: crypto.randomUUID(),
      confirmWarnings,
      values: {
        appointment_date: date,
        start_time: minToTime(startMinute),
        end_time: minToTime(
          startMinute + appointment!.duration_minutes,
        ),
      },
    }
  }

  async function submit(confirmWarnings?: string[]) {
    setPending(true)
    try {
      const result = await mutateCalendarOrThrow(request(confirmWarnings))
      if (!result.appointment) throw new Error(t('appt.moveFailed'))
      setWarning(null)
      toast.success(t('appt.moved'))
      onMoved(result.appointment)
      onOpenChange(false)
    } catch (error) {
      if (isCalendarWarningConfirmation(error)) {
        setWarning(error)
      } else {
        toast.error(error instanceof Error ? error.message : t('appt.moveFailed'))
      }
    } finally {
      setPending(false)
    }
  }

  const warningCodes = warning
    ? Array.from(new Set(
        warning.constraints
          .filter((constraint) => constraint.level === 'warning')
          .map((constraint) => constraint.code),
      ))
    : []

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader className="relative text-left">
            <DrawerTitle>{t('appt.moveTitle')}</DrawerTitle>
            <DrawerDescription>{t('appt.moveDescription')}</DrawerDescription>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('common.close')}
                className="absolute right-2 top-2 min-h-11 min-w-11"
              >
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>
          </DrawerHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <div className="space-y-4 px-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="move-appointment-date">{t('appt.date')}</Label>
                <Input
                  id="move-appointment-date"
                  type="date"
                  value={date}
                  required
                  onChange={(event) => {
                    setDate(event.target.value)
                    setWarning(null)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="move-appointment-start">{t('appt.start')}</Label>
                <Input
                  id="move-appointment-start"
                  type="time"
                  value={start}
                  required
                  onChange={(event) => {
                    setStart(event.target.value)
                    setWarning(null)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="move-appointment-duration">
                  {t('appt.duration')}
                </Label>
                <Input
                  id="move-appointment-duration"
                  type="number"
                  value={appointment.duration_minutes}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  {t('appt.moveDurationHint')}
                </p>
              </div>

              {warning ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
                >
                  <div className="flex gap-2">
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300"
                    />
                    <div>
                      <p className="text-sm font-semibold">
                        {t('appt.warningTitle')}
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                        {warning.constraints.map((constraint) => (
                          <li key={`${constraint.code}-${constraint.message}`}>
                            {constraint.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
              {warning ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void submit(warningCodes)}
                >
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('appt.moveAnyway')}
                </Button>
              ) : (
                <Button type="submit" disabled={pending || !date || !start}>
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('appt.moveAction')}
                </Button>
              )}
              <DrawerClose asChild>
                <Button type="button" variant="outline">
                  {t('common.cancel')}
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
