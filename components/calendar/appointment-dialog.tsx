'use client'

import type { CalendarAppointment } from '@/lib/api/appointments'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AppointmentForm } from './appointment-form'
import { useT } from '@/lib/i18n/use-t'

export interface AppointmentDialogProps {
  businessId: string
  appt?: CalendarAppointment | null
  defaultDate?: string
  defaultStart?: string
  defaultPatientId?: string
  defaultServiceId?: string
  defaultDurationMinutes?: number
  open: boolean
  onOpenChange(open: boolean): void
}

export function AppointmentDialog({
  businessId,
  appt,
  defaultDate,
  defaultStart,
  defaultPatientId,
  defaultServiceId,
  defaultDurationMinutes,
  open,
  onOpenChange,
}: AppointmentDialogProps) {
  const { t } = useT()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {appt ? t('appt.editTitle') : t('appt.newTitle')}
          </DialogTitle>
        </DialogHeader>
        <AppointmentForm
          businessId={businessId}
          appointment={appt}
          defaultDate={defaultDate}
          defaultStart={defaultStart}
          defaultPatientId={defaultPatientId}
          defaultServiceId={defaultServiceId}
          defaultDurationMinutes={defaultDurationMinutes}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
