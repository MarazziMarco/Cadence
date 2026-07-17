'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Mic, MicOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  createAppointment,
  deleteAppointment,
  listPatientsForSelect,
  minToTime,
  timeToMin,
  updateAppointment,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import {
  confirmCalendarMutationInteractively,
  isCalendarWarningConfirmation,
} from '@/lib/api/calendar'
import {
  createDefaultWeeklyAvailability,
  createPatient,
  getPatientWeeklyAvailability,
  replacePatientWeeklyAvailability,
  type WeeklyAvailability,
} from '@/lib/api/patients'
import { listServices } from '@/lib/api/services'
import { createAdvanceWaiting } from '@/lib/api/waiting-list'
import { listWorkingHours } from '@/lib/api/working-hours'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { businessToday } from '@/lib/calendar/date'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils.js'
import { parseAppointment } from '@/lib/voice/parse-appointment'
import { speechLang, useSpeech } from '@/lib/voice/use-speech'
import { useWorkspace } from '@/lib/workspace-context'
import { WEEKDAYS, type Weekday } from '@/lib/types/db'
import { PatientAvailabilityEditor } from '@/components/patients/patient-availability-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
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

export interface AppointmentFormProps {
  businessId: string
  appointment?: CalendarAppointment | null
  defaultDate?: string
  defaultStart?: string
  defaultPatientId?: string
  defaultServiceId?: string
  defaultDurationMinutes?: number
  onSaved(appointmentId: string): void
  onCancel(): void
  onDirtyChange?(dirty: boolean): void
  className?: string
  bodyClassName?: string
  actionsClassName?: string
}

function shortWeekdays(locale: string): string[] {
  return Array.from({ length: 7 }, (_, index) => (
    new Date(2024, 0, 1 + index).toLocaleDateString(locale, {
      weekday: 'short',
    })
  ))
}

export function AppointmentForm({
  businessId,
  appointment,
  defaultDate,
  defaultStart,
  defaultPatientId,
  defaultServiceId,
  defaultDurationMinutes,
  onSaved,
  onCancel,
  onDirtyChange,
  className,
  bodyClassName,
  actionsClassName,
}: AppointmentFormProps) {
  const queryClient = useQueryClient()
  const { business } = useWorkspace()
  const { t, locale } = useT()
  const weekdays = shortWeekdays(bcp47(locale))
  const editing = Boolean(appointment)
  const [patientId, setPatientId] = useState('')
  const [newClient, setNewClient] = useState('')
  const [serviceId, setServiceId] = useState('none')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState(
    String(business?.default_appointment_duration ?? 30),
  )
  const [moreOpen, setMoreOpen] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  const [weeklyAvailability, setWeeklyAvailability] = useState(
    createDefaultWeeklyAvailability,
  )
  const [advanceUp, setAdvanceUp] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const availabilityEditedRef = useRef(false)

  const setFormDirty = useCallback((nextDirty: boolean) => {
    onDirtyChange?.(nextDirty)
  }, [onDirtyChange])

  const markDirty = useCallback(() => {
    setFormError(null)
    setFormDirty(true)
  }, [setFormDirty])

  const { data: patients = [] } = useQuery({
    queryKey: ['patients-select', businessId],
    queryFn: () => listPatientsForSelect(businessId),
    enabled: Boolean(businessId),
  })
  const { data: services = [] } = useQuery({
    queryKey: ['services', businessId],
    queryFn: () => listServices(businessId),
    enabled: Boolean(businessId),
  })
  const { data: workingHours = [] } = useQuery({
    queryKey: ['working-hours', businessId],
    queryFn: () => listWorkingHours(businessId),
    enabled: Boolean(businessId),
  })
  const { data: savedWeeklyAvailability } = useQuery({
    queryKey: ['patient-weekly-availability', patientId, workingHours],
    queryFn: () => getPatientWeeklyAvailability(patientId, workingHours),
    enabled: Boolean(showAvailability && patientId),
  })
  const {
    supported: micSupported,
    listening,
    start: startRecording,
    stop: stopRecording,
  } = useSpeech(speechLang(business?.language))

  useEffect(() => {
    setPatientId(appointment?.patient_id ?? defaultPatientId ?? '')
    setNewClient('')
    setServiceId(appointment?.service_id ?? defaultServiceId ?? 'none')
    setDate(
      appointment?.appointment_date
      ?? defaultDate
      ?? businessToday(business?.timezone || 'UTC'),
    )
    setStart(
      appointment?.start_time.slice(0, 5)
      ?? defaultStart
      ?? '09:00',
    )
    setDuration(String(
      appointment?.duration_minutes
      ?? defaultDurationMinutes
      ?? business?.default_appointment_duration
      ?? 30,
    ))
    setMoreOpen(false)
    setShowAvailability(false)
    setWeeklyAvailability(createDefaultWeeklyAvailability())
    availabilityEditedRef.current = false
    setAdvanceUp(false)
    setFormError(null)
    setFormDirty(false)
  }, [
    appointment,
    business?.default_appointment_duration,
    business?.timezone,
    defaultDate,
    defaultDurationMinutes,
    defaultPatientId,
    defaultServiceId,
    defaultStart,
    setFormDirty,
  ])

  useEffect(() => {
    if (
      showAvailability
      && patientId
      && savedWeeklyAvailability
      && !availabilityEditedRef.current
    ) {
      setWeeklyAvailability(savedWeeklyAvailability)
    }
  }, [patientId, savedWeeklyAvailability, showAvailability])

  function applyVoice(text: string) {
    const result = parseAppointment(text, patients as any, services as any)
    let matchedPatient = false
    if (result.patient.kind === 'existing') {
      setPatientId(result.patient.id)
      setNewClient('')
      matchedPatient = true
    } else if (result.patient.kind === 'new') {
      setNewClient(result.patient.proposedName)
      setPatientId('')
      matchedPatient = true
    }
    if (result.serviceId) setServiceId(result.serviceId)
    if (result.date) setDate(result.date)
    if (result.time) setStart(result.time)
    if (result.durationMinutes) setDuration(String(result.durationMinutes))
    if (result.availability) {
      const patch = result.availability
      setShowAvailability(true)
      availabilityEditedRef.current = true
      setWeeklyAvailability((current) => {
        const base: WeeklyAvailability = patch.mode === 'replace'
          ? (Object.fromEntries(WEEKDAYS.map((d) => [d, 'unavailable'])) as WeeklyAvailability)
          : { ...current }
        for (const [d, state] of Object.entries(patch.days)) base[d as Weekday] = state!
        return base
      })
    }
    if (
      matchedPatient
      || result.serviceId
      || result.date
      || result.time
      || result.durationMinutes
      || result.availability
    ) {
      markDirty()
    }
    if (!matchedPatient && !result.date && !result.time) {
      toast(t('appt.didntCatch'))
    }
  }

  function toggleMic() {
    if (listening) {
      stopRecording()
      return
    }
    startRecording(applyVoice, () => toast.error(t('appt.micDenied')))
  }

  function onServiceChange(nextServiceId: string) {
    markDirty()
    setServiceId(nextServiceId)
    const service = services.find((candidate: any) => candidate.id === nextServiceId)
    if (service) setDuration(String(service.duration_minutes))
  }

  function invalidateAfterSave() {
    invalidateCalendarAppointments(queryClient, businessId)
    queryClient.invalidateQueries({ queryKey: ['patients'] })
    queryClient.invalidateQueries({ queryKey: ['patients-select'] })
    queryClient.invalidateQueries({ queryKey: ['waiting'] })
  }

  const save = useMutation({
    mutationFn: async () => {
      let resolvedPatientId = patientId
      if (!resolvedPatientId && newClient.trim()) {
        const patient = await createPatient(businessId, {
          first_name: newClient.trim(),
        })
        resolvedPatientId = patient.id
      }

      if (resolvedPatientId && showAvailability) {
        await replacePatientWeeklyAvailability(
          resolvedPatientId,
          weeklyAvailability,
          workingHours,
        )
      }

      const startMinute = timeToMin(`${start}:00`)
      const durationMinutes = Number.parseInt(duration, 10) || 30
      if (startMinute + durationMinutes > 24 * 60) {
        throw new RangeError(t('appt.endNextDay'))
      }
      const service = services.find((candidate: any) => candidate.id === serviceId)
      const values = {
        patient_id: resolvedPatientId,
        service_id: serviceId === 'none' ? null : serviceId,
        appointment_date: date,
        start_time: minToTime(startMinute),
        end_time: minToTime(startMinute + durationMinutes),
        duration_minutes: durationMinutes,
        price: service?.price ?? 0,
        color: service?.color ?? '#4f46e5',
        title: service?.name ?? null,
      }

      if (appointment) {
        return updateAppointment(
          businessId,
          appointment.id,
          appointment.version,
          values,
        )
      }

      const created = await createAppointment(businessId, values)
      if (advanceUp && created?.id) {
        await createAdvanceWaiting(businessId, {
          patientId: resolvedPatientId,
          appointmentId: created.id,
          appointmentDate: date,
          serviceId: values.service_id,
          durationMinutes,
        })
      }
      return created
    },
    onSuccess: (savedAppointment) => {
      if (!savedAppointment?.id) return
      setFormDirty(false)
      toast.success(editing ? t('appt.updated') : t('appt.created'))
      invalidateAfterSave()
      onSaved(savedAppointment.id)
    },
    onError: async (error: unknown) => {
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(error instanceof Error ? error.message : t('appt.saveFailed'))
        return
      }
      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (!confirmed?.appointment?.id) return
        if (!editing && advanceUp) {
          const values = error.request.values
          await createAdvanceWaiting(businessId, {
            patientId: String(values.patient_id),
            appointmentId: confirmed.appointment.id,
            appointmentDate: String(values.appointment_date),
            serviceId: (values.service_id as string | null) ?? null,
            durationMinutes: Number(values.duration_minutes),
          })
        }
        setFormDirty(false)
        toast.success(editing ? t('appt.updated') : t('appt.created'))
        invalidateAfterSave()
        onSaved(confirmed.appointment.id)
      } catch (retryError) {
        toast.error(
          retryError instanceof Error ? retryError.message : t('appt.saveFailed'),
        )
      }
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteAppointment(
      businessId,
      appointment!.id,
      appointment!.version,
    ),
    onSuccess: () => {
      setFormDirty(false)
      toast.success(t('appt.deleted'))
      invalidateCalendarAppointments(queryClient, businessId)
      onSaved(appointment!.id)
    },
    onError: async (error: unknown) => {
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(error instanceof Error ? error.message : t('appt.saveFailed'))
        return
      }
      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (!confirmed) return
        setFormDirty(false)
        toast.success(t('appt.deleted'))
        invalidateCalendarAppointments(queryClient, businessId)
        onSaved(appointment!.id)
      } catch (retryError) {
        toast.error(
          retryError instanceof Error ? retryError.message : t('appt.saveFailed'),
        )
      }
    },
  })

  return (
    <form
      className={className}
      onChangeCapture={markDirty}
      onSubmit={(event) => {
        event.preventDefault()
        const startMinute = timeToMin(`${start}:00`)
        const durationMinutes = Number.parseInt(duration, 10) || 30
        if (startMinute + durationMinutes > 24 * 60) {
          setFormError(t('appt.endNextDay'))
          return
        }
        setFormError(null)
        save.mutate()
      }}
    >
      {!editing && micSupported ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant={listening ? 'destructive' : 'outline'}
            onClick={toggleMic}
          >
            {listening ? (
              <>
                <MicOff className="mr-1.5 h-3.5 w-3.5" />
                {t('appt.stop')}
              </>
            ) : (
              <>
                <Mic className="mr-1.5 h-3.5 w-3.5" />
                {t('appt.dictate')}
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            {listening ? t('appt.listening') : t('appt.dictateHint')}
          </span>
        </div>
      ) : null}

      <div className={cn('space-y-4 py-4', bodyClassName)}>
        <div className="space-y-2">
          <Label>{t('appt.client')}</Label>
          <Select
            value={patientId}
            onValueChange={(value) => {
              markDirty()
              setPatientId(value)
              setNewClient('')
              setWeeklyAvailability(createDefaultWeeklyAvailability())
              availabilityEditedRef.current = false
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('appt.selectClient')} />
            </SelectTrigger>
            <SelectContent>
              {patients.map((patient: any) => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.full_name || patient.first_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!editing ? (
            <Input
              placeholder={t('appt.newClientPh')}
              value={newClient}
              onChange={(event) => {
                markDirty()
                setNewClient(event.target.value)
                if (event.target.value) {
                  setPatientId('')
                  setWeeklyAvailability(createDefaultWeeklyAvailability())
                  availabilityEditedRef.current = false
                }
              }}
            />
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>{t('appt.service')}</Label>
          <Select value={serviceId} onValueChange={onServiceChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('appt.noService')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('appt.noService')}</SelectItem>
              {services.map((service: any) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.emoji ? `${service.emoji} ` : ''}
                  {service.name} · {service.duration_minutes}m
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="appointment-date">{t('appt.date')}</Label>
            <Input
              id="appointment-date"
              type="date"
              value={date}
              onChange={(event) => {
                markDirty()
                setDate(event.target.value)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appointment-start">{t('appt.start')}</Label>
            <Input
              id="appointment-start"
              type="time"
              value={start}
              onChange={(event) => {
                markDirty()
                setStart(event.target.value)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appointment-duration">{t('appt.duration')}</Label>
            <select
              id="appointment-duration"
              value={duration}
              onChange={(event) => {
                markDirty()
                setDuration(event.target.value)
              }}
              className="flex h-9 w-24 rounded-md border border-input bg-transparent px-2 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            >
              {Array.from({ length: 200 }, (_, index) => index + 1).map(
                (minutes) => (
                  <option key={minutes} value={minutes}>{minutes}</option>
                ),
              )}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="appointment-more-options"
            onClick={() => setMoreOpen((current) => !current)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium"
          >
            {t('appt.moreOptions')}
            <ChevronDown
              aria-hidden
              className={cn(
                'h-4 w-4 transition-transform',
                moreOpen && 'rotate-180',
              )}
            />
          </button>
          {moreOpen ? (
            <div
              id="appointment-more-options"
              className="space-y-4 border-t border-border p-3"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">{t('appt.availTitle')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('appt.availHint')}
                    </p>
                  </div>
                  <Switch
                    checked={showAvailability}
                    onCheckedChange={(checked) => {
                      markDirty()
                      setShowAvailability(checked)
                      availabilityEditedRef.current = false
                      if (!checked || !patientId) {
                        setWeeklyAvailability(createDefaultWeeklyAvailability())
                      }
                    }}
                  />
                </div>
                {showAvailability ? (
                  <div className="mt-3 space-y-3">
                    <PatientAvailabilityEditor
                      value={weeklyAvailability}
                      weekdayLabels={Object.fromEntries(
                        WEEKDAYS.map((weekday, index) => [
                          weekday,
                          weekdays[index],
                        ]),
                      )}
                      stateLabels={{
                        unavailable: t('appt.neverDays'),
                        all_day: t('appt.any'),
                        morning_only: t('appt.morning'),
                        afternoon_only: t('appt.afternoon'),
                        prefer_morning: `${t('appt.preferredTime')}: ${t('appt.morning')}`,
                        prefer_afternoon: `${t('appt.preferredTime')}: ${t('appt.afternoon')}`,
                      }}
                      onChange={(next) => {
                        markDirty()
                        availabilityEditedRef.current = true
                        setWeeklyAvailability(next)
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t('appt.availNote')}
                    </p>
                  </div>
                ) : null}
              </div>
              {!editing ? (
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <div>
                    <p className="text-sm font-medium">
                      {t('appt.advanceTitle')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('appt.advanceHint')}
                    </p>
                  </div>
                  <Switch
                    checked={advanceUp}
                    onCheckedChange={(checked) => {
                      markDirty()
                      setAdvanceUp(checked)
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p className="px-1 pb-3 text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <div className={cn(
        'flex items-center justify-between gap-3',
        actionsClassName,
      )}>
        {editing ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('common.delete')}
                className="min-h-11 min-w-11 text-destructive"
                disabled={remove.isPending}
              >
                <Trash2 className="h-4 w-4" />
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
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {t('appt.deleteAction')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              (!patientId && !newClient.trim())
              || save.isPending
              || remove.isPending
            }
          >
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </div>
      </div>
    </form>
  )
}
