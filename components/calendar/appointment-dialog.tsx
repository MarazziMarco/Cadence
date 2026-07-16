'use client'

import { useCallback, useState } from 'react'
import type { CalendarAppointment } from '@/lib/api/appointments'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AppointmentForm } from './appointment-form'
import { useT } from '@/lib/i18n/use-t'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type AppointmentEditorPresentation = 'dialog' | 'drawer'

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
  presentation?: AppointmentEditorPresentation
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
  presentation = 'dialog',
}: AppointmentDialogProps) {
  const { t } = useT()
  const [dirty, setDirty] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const closeImmediately = useCallback(() => {
    setDirty(false)
    setDiscardOpen(false)
    onOpenChange(false)
  }, [onOpenChange])

  const requestClose = useCallback(() => {
    if (dirty) {
      setDiscardOpen(true)
      return
    }
    closeImmediately()
  }, [closeImmediately, dirty])

  const form = (
    <AppointmentForm
      businessId={businessId}
      appointment={appt}
      defaultDate={defaultDate}
      defaultStart={defaultStart}
      defaultPatientId={defaultPatientId}
      defaultServiceId={defaultServiceId}
      defaultDurationMinutes={defaultDurationMinutes}
      onDirtyChange={setDirty}
      onSaved={closeImmediately}
      onCancel={requestClose}
      className={presentation === 'drawer'
        ? 'flex min-h-0 flex-1 flex-col'
        : undefined}
      bodyClassName={presentation === 'drawer'
        ? 'min-h-0 flex-1 overflow-y-auto px-4'
        : undefined}
      actionsClassName={presentation === 'drawer'
        ? 'sticky bottom-0 z-10 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3'
        : undefined}
    />
  )

  const discardConfirmation = (
    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('appt.discardTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('appt.discardDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('appt.keepEditing')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={closeImmediately}
          >
            {t('appt.discardAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (presentation === 'drawer') {
    return (
      <>
        <Drawer
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) requestClose()
          }}
        >
          <DrawerContent className="h-[100dvh] max-h-[100dvh] rounded-none">
            <DrawerHeader className="shrink-0 border-b border-border text-left">
              <DrawerTitle>
                {appt ? t('appt.editTitle') : t('appt.newTitle')}
              </DrawerTitle>
              <DrawerDescription>{t('appt.sheetDescription')}</DrawerDescription>
            </DrawerHeader>
            {form}
          </DrawerContent>
        </Drawer>
        {discardConfirmation}
      </>
    )
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {appt ? t('appt.editTitle') : t('appt.newTitle')}
            </DialogTitle>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
      {discardConfirmation}
    </>
  )
}
