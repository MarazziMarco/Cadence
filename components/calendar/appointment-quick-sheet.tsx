'use client'

import {
  CalendarClock,
  Copy,
  Edit3,
  Lock,
  Mail,
  MapPin,
  Phone,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'

import type { CalendarAppointment } from '@/lib/api/appointments'
import { formatBusinessDate } from '@/lib/calendar/date'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

export interface AppointmentQuickSheetProps {
  open: boolean
  appointment: CalendarAppointment | null
  onOpenChange(open: boolean): void
  onMove(): void
  onEdit(): void
  onToggleLock(): void | Promise<void>
  onDuplicate(): void | Promise<void>
  onDelete(): void | Promise<void>
  lockPending?: boolean
  deletePending?: boolean
}

function safePhoneHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const normalized = phone.replace(/[^\d+*#]/g, '')
  if (!normalized || !/^\+?[\d*#]+$/.test(normalized)) return null
  return `tel:${normalized}`
}

function safeEmailHref(email: string | null | undefined): string | null {
  if (!email) return null
  const normalized = email.trim()
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    || /[\r\n]/.test(normalized)
  ) return null
  return `mailto:${normalized}`
}

export function AppointmentQuickSheet({
  open,
  appointment,
  onOpenChange,
  onMove,
  onEdit,
  onToggleLock,
  onDuplicate,
  onDelete,
  lockPending = false,
  deletePending = false,
}: AppointmentQuickSheetProps) {
  const { t, locale } = useT()

  if (!appointment) return null

  const patientName = (
    appointment.patients?.full_name
    || [appointment.patients?.first_name, appointment.patients?.last_name]
      .filter(Boolean)
      .join(' ')
    || t('appt.unknownClient')
  )
  const serviceName = appointment.services?.name || appointment.title
    || t('appt.noService')
  const phoneHref = safePhoneHref(appointment.patients?.phone)
  const emailHref = safeEmailHref(appointment.patients?.email)
  const color = (
    appointment.patients?.color
    || appointment.services?.color
    || appointment.color
    || '#6d4bd8'
  )
  const formattedDate = formatBusinessDate(
    appointment.appointment_date,
    bcp47(locale),
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  )

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="relative px-0 pb-2 pt-5 text-left">
            <div className="flex items-start gap-3 pr-12">
              <span
                aria-hidden
                className="mt-1 h-4 w-4 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0">
                <DrawerTitle className="truncate text-xl">
                  {patientName}
                </DrawerTitle>
                <DrawerDescription className="mt-1">
                  {serviceName}
                </DrawerDescription>
              </div>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('common.close')}
                className="absolute right-0 top-3 min-h-11 min-w-11"
              >
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>
          </DrawerHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <CalendarClock
                  aria-hidden
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                />
                <div>
                  <p className="font-medium">{formattedDate}</p>
                  <p className="text-sm text-muted-foreground">
                    {appointment.start_time.slice(0, 5)}
                    {' – '}
                    {appointment.end_time.slice(0, 5)}
                    {' · '}
                    {appointment.duration_minutes} {t('appt.minutesShort')}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-sm">
                <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">
                  {t(`cal.status.${appointment.status}`)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-medium">
                  {appointment.locked ? (
                    <Lock aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <Unlock aria-hidden className="h-3.5 w-3.5" />
                  )}
                  {appointment.locked ? t('appt.locked') : t('appt.unlocked')}
                </span>
              </div>
            </div>

            {(phoneHref || emailHref) ? (
              <div className="grid grid-cols-2 gap-2">
                {phoneHref ? (
                  <Button asChild variant="outline" className="min-h-11">
                    <a href={phoneHref}>
                      <Phone aria-hidden className="mr-2 h-4 w-4" />
                      {t('appt.call')}
                    </a>
                  </Button>
                ) : null}
                {emailHref ? (
                  <Button asChild variant="outline" className="min-h-11">
                    <a href={emailHref}>
                      <Mail aria-hidden className="mr-2 h-4 w-4" />
                      {t('appt.email')}
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-col gap-1 py-2"
                disabled={appointment.locked}
                onClick={onMove}
              >
                <MapPin aria-hidden className="h-4 w-4" />
                {t('appt.move')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-col gap-1 py-2"
                disabled={lockPending}
                onClick={() => void onToggleLock()}
              >
                {appointment.locked ? (
                  <Unlock aria-hidden className="h-4 w-4" />
                ) : (
                  <Lock aria-hidden className="h-4 w-4" />
                )}
                {appointment.locked ? t('appt.unlock') : t('appt.lock')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-col gap-1 py-2"
                onClick={onEdit}
              >
                <Edit3 aria-hidden className="h-4 w-4" />
                {t('common.edit')}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => void onDuplicate()}
              >
                <Copy aria-hidden className="mr-2 h-4 w-4" />
                {t('appt.duplicate')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 text-destructive hover:text-destructive"
                    disabled={deletePending}
                  >
                    <Trash2 aria-hidden className="mr-2 h-4 w-4" />
                    {t('common.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-xl sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('appt.deleteTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('appt.deleteDescription')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deletePending}
                      onClick={() => void onDelete()}
                    >
                      {t('appt.deleteAction')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
