'use client'

import { useEffect, useState } from 'react'
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
import { createPatient, setPatientWeekdayAvailability } from '@/lib/api/patients'
import { listServices } from '@/lib/api/services'
import { createAdvanceWaiting } from '@/lib/api/waiting-list'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils.js'
import { parseAppointment } from '@/lib/voice/parse-appointment'
import { speechLang, useSpeech } from '@/lib/voice/use-speech'
import { useWorkspace } from '@/lib/workspace-context'
import { WEEKDAYS, type Weekday } from '@/lib/types/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

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
}

function localDate(): string {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
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
  const [availableOnly, setAvailableOnly] = useState<Set<Weekday>>(new Set())
  const [neverAvailable, setNeverAvailable] = useState<Set<Weekday>>(new Set())
  const [preferred, setPreferred] = useState<'morning' | 'afternoon' | null>(null)
  const [advanceUp, setAdvanceUp] = useState(false)

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
    setDate(appointment?.appointment_date ?? defaultDate ?? localDate())
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
    setAvailableOnly(new Set())
    setNeverAvailable(new Set())
    setPreferred(null)
    setAdvanceUp(false)
  }, [
    appointment,
    business?.default_appointment_duration,
    defaultDate,
    defaultDurationMinutes,
    defaultPatientId,
    defaultServiceId,
    defaultStart,
  ])

  function applyVoice(text: string) {
    const result = parseAppointment(text, patients as any, services as any)
    if (result.patientId) {
      setPatientId(result.patientId)
      setNewClient('')
    }
    if (result.serviceId) setServiceId(result.serviceId)
    if (result.date) setDate(result.date)
    if (result.time) setStart(result.time)
    if (result.durationMinutes) setDuration(String(result.durationMinutes))
    if (!result.patientId && !result.date && !result.time) {
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

  function resolveAvailability(): Weekday[] | null {
    if (!showAvailability) return null
    if (availableOnly.size > 0) {
      return WEEKDAYS.filter(
        (weekday) => (
          availableOnly.has(weekday) && !neverAvailable.has(weekday)
        ),
      )
    }
    if (neverAvailable.size > 0) {
      return WEEKDAYS.filter((weekday) => !neverAvailable.has(weekday))
    }
    return null
  }

  function toggleWeekday(
    values: Set<Weekday>,
    setValues: (next: Set<Weekday>) => void,
    weekday: Weekday,
  ) {
    const next = new Set(values)
    if (next.has(weekday)) next.delete(weekday)
    else next.add(weekday)
    setValues(next)
  }

  function onServiceChange(nextServiceId: string) {
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

      const availability = resolveAvailability()
      if (
        resolvedPatientId
        && showAvailability
        && ((availability && availability.length > 0) || preferred)
      ) {
        await setPatientWeekdayAvailability(
          resolvedPatientId,
          availability ?? [],
          preferred,
        )
      }

      const startMinute = timeToMin(`${start}:00`)
      const durationMinutes = Number.parseInt(duration, 10) || 30
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
      onSubmit={(event) => {
        event.preventDefault()
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

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>{t('appt.client')}</Label>
          <Select
            value={patientId}
            onValueChange={(value) => {
              setPatientId(value)
              setNewClient('')
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
                setNewClient(event.target.value)
                if (event.target.value) setPatientId('')
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
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appointment-start">{t('appt.start')}</Label>
            <Input
              id="appointment-start"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appointment-duration">{t('appt.duration')}</Label>
            <select
              id="appointment-duration"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
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
                    onCheckedChange={setShowAvailability}
                  />
                </div>
                {showAvailability ? (
                  <div className="mt-3 space-y-3">
                    <WeekdayChoices
                      label={t('appt.onlyDays')}
                      weekdays={weekdays}
                      selected={availableOnly}
                      tone="primary"
                      onToggle={(weekday) => toggleWeekday(
                        availableOnly,
                        setAvailableOnly,
                        weekday,
                      )}
                    />
                    <WeekdayChoices
                      label={t('appt.neverDays')}
                      weekdays={weekdays}
                      selected={neverAvailable}
                      tone="destructive"
                      onToggle={(weekday) => toggleWeekday(
                        neverAvailable,
                        setNeverAvailable,
                        weekday,
                      )}
                    />
                    <div>
                      <p className="mb-1.5 text-xs font-medium">
                        {t('appt.preferredTime')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          ['any', 'appt.any'],
                          ['morning', 'appt.morning'],
                          ['afternoon', 'appt.afternoon'],
                        ] as const).map(([value, key]) => {
                          const active = (
                            (value === 'any' && !preferred)
                            || preferred === value
                          )
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setPreferred(
                                value === 'any' ? null : value,
                              )}
                              className={cn(
                                'min-h-9 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                                active
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-card hover:bg-accent',
                              )}
                            >
                              {t(key)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
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
                  <Switch checked={advanceUp} onCheckedChange={setAdvanceUp} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('common.delete')}
            className="min-h-11 min-w-11 text-destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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

function WeekdayChoices({
  label,
  weekdays,
  selected,
  tone,
  onToggle,
}: {
  label: string
  weekdays: string[]
  selected: Set<Weekday>
  tone: 'primary' | 'destructive'
  onToggle(weekday: Weekday): void
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((weekday, index) => (
          <button
            key={weekday}
            type="button"
            aria-pressed={selected.has(weekday)}
            onClick={() => onToggle(weekday)}
            className={cn(
              'min-h-9 rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
              selected.has(weekday)
                ? tone === 'primary'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-destructive bg-destructive text-destructive-foreground'
                : 'border-border bg-card hover:bg-accent',
            )}
          >
            {weekdays[index]}
          </button>
        ))}
      </div>
    </div>
  )
}
