'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Trash2, Mic, MicOff } from 'lucide-react'
import { createAppointment, updateAppointment, deleteAppointment, listPatientsForSelect, minToTime, timeToMin, type CalendarAppointment } from '@/lib/api/appointments'
import { createPatient, setPatientWeekdayAvailability } from '@/lib/api/patients'
import { createAdvanceWaiting } from '@/lib/api/waiting-list'
import { listServices } from '@/lib/api/services'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { bcp47 } from '@/lib/i18n'
import { parseAppointment } from '@/lib/voice/parse-appointment'
import { useSpeech, speechLang } from '@/lib/voice/use-speech'
import {
  confirmCalendarMutationInteractively,
  isCalendarWarningConfirmation,
} from '@/lib/api/calendar'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { WEEKDAYS, type Weekday } from '@/lib/types/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Short weekday labels (Mon-first) in the given date-locale.
function dowShort(dloc: string): string[] {
  // 2024-01-01 is a Monday.
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(dloc, { weekday: 'short' }))
}

export function AppointmentDialog({ businessId, appt, defaultDate, defaultStart, defaultPatientId, open, onOpenChange }: { businessId: string; appt?: CalendarAppointment | null; defaultDate?: string; defaultStart?: string; defaultPatientId?: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { business } = useWorkspace()
  const { t, locale } = useT()
  const dow = dowShort(bcp47(locale))
  const editing = !!appt
  const [patientId, setPatientId] = useState('')
  const [newClient, setNewClient] = useState('')
  const [serviceId, setServiceId] = useState<string>('none')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState(String(business?.default_appointment_duration ?? 30))
  // Optional per-client availability the optimizer can use.
  const [showAvail, setShowAvail] = useState(false)
  const [availOnly, setAvailOnly] = useState<Set<Weekday>>(new Set())
  const [availNever, setAvailNever] = useState<Set<Weekday>>(new Set())
  const [preferred, setPreferred] = useState<'morning' | 'afternoon' | null>(null)
  const [advanceUp, setAdvanceUp] = useState(false)

  const { data: patients = [] } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: !!businessId && open })
  const { data: services = [] } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: !!businessId && open })

  const { supported: micSupported, listening, start: startRec, stop: stopRec } = useSpeech(speechLang(business?.language))

  // Dictate instead of typing: transcribe, parse locally, prefill the fields.
  function applyVoice(text: string) {
    const r = parseAppointment(text, patients as any, services as any)
    if (r.patientId) { setPatientId(r.patientId); setNewClient('') }
    if (r.serviceId) setServiceId(r.serviceId)
    if (r.date) setDate(r.date)
    if (r.time) setStart(r.time)
    if (r.durationMinutes) setDuration(String(r.durationMinutes))
    if (!r.patientId && !r.date && !r.time) toast(t('appt.didntCatch'))
  }

  function toggleMic() {
    if (listening) { stopRec(); return }
    startRec(applyVoice, () => toast.error(t('appt.micDenied')))
  }

  useEffect(() => {
    if (open) {
      setPatientId(appt?.patient_id ?? defaultPatientId ?? '')
      setNewClient('')
      setServiceId(appt?.service_id ?? 'none')
      setDate(appt?.appointment_date ?? defaultDate ?? (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })())
      setStart(appt ? appt.start_time.slice(0, 5) : (defaultStart ?? '09:00'))
      setDuration(String(appt?.duration_minutes ?? business?.default_appointment_duration ?? 30))
      setShowAvail(false); setAvailOnly(new Set()); setAvailNever(new Set()); setPreferred(null); setAdvanceUp(false)
    }
  }, [open])

  // Resolve the two optional inputs to the concrete weekdays the client can come.
  // "Only on" wins; otherwise it's every day except the "never" ones. Null = no
  // constraint (client stays flexible).
  function resolveAvail(): Weekday[] | null {
    if (!showAvail) return null
    if (availOnly.size) return WEEKDAYS.filter((w) => availOnly.has(w) && !availNever.has(w))
    if (availNever.size) return WEEKDAYS.filter((w) => !availNever.has(w))
    return null
  }
  function toggle(set: Set<Weekday>, setter: (s: Set<Weekday>) => void, w: Weekday) {
    const n = new Set(set); n.has(w) ? n.delete(w) : n.add(w); setter(n)
  }

  function onServiceChange(id: string) {
    setServiceId(id)
    const svc = services.find((s: any) => s.id === id)
    if (svc) setDuration(String(svc.duration_minutes))
  }

  const save = useMutation({
    mutationFn: async () => {
      let pid = patientId
      if (!pid && newClient.trim()) { const np = await createPatient(businessId, { first_name: newClient.trim() }); pid = np.id }
      // Persist optional client availability for the optimizer to use.
      const availDays = resolveAvail()
      if (pid && showAvail && ((availDays && availDays.length) || preferred)) await setPatientWeekdayAvailability(pid, availDays ?? [], preferred)
      const startMin = timeToMin(start + ':00')
      const dur = parseInt(duration) || 30
      const svc = services.find((s: any) => s.id === serviceId)
      const values: any = {
        patient_id: pid,
        service_id: serviceId === 'none' ? null : serviceId,
        appointment_date: date,
        start_time: minToTime(startMin),
        end_time: minToTime(startMin + dur),
        duration_minutes: dur,
        price: svc?.price ?? 0,
        color: svc?.color ?? '#4f46e5',
        title: svc?.name ?? null,
      }
      if (editing) return updateAppointment(businessId, appt!.id, appt!.version, values)
      const created = await createAppointment(businessId, values)
      if (advanceUp && created?.id) {
        await createAdvanceWaiting(businessId, { patientId: pid, appointmentId: created.id, appointmentDate: date, serviceId: values.service_id, durationMinutes: dur })
      }
      return created
    },
    onSuccess: () => finishSave(),
    onError: async (error: unknown) => {
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(error instanceof Error ? error.message : t('appt.saveFailed'))
        return
      }
      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (!confirmed) return
        const created = confirmed.appointment
        if (!editing && advanceUp && created?.id) {
          const values = error.request.values
          await createAdvanceWaiting(businessId, {
            patientId: String(values.patient_id),
            appointmentId: created.id,
            appointmentDate: String(values.appointment_date),
            serviceId: (values.service_id as string | null) ?? null,
            durationMinutes: Number(values.duration_minutes),
          })
        }
        finishSave()
      } catch (retryError) {
        toast.error(retryError instanceof Error ? retryError.message : t('appt.saveFailed'))
      }
    },
  })

  const del = useMutation({
    mutationFn: () => deleteAppointment(businessId, appt!.id, appt!.version),
    onSuccess: () => finishDelete(),
    onError: async (error: unknown) => {
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(error instanceof Error ? error.message : t('appt.saveFailed'))
        return
      }
      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (confirmed) finishDelete()
      } catch (retryError) {
        toast.error(retryError instanceof Error ? retryError.message : t('appt.saveFailed'))
      }
    },
  })

  function finishSave() {
    toast.success(editing ? t('appt.updated') : t('appt.created'))
    invalidateCalendarAppointments(qc, businessId)
    qc.invalidateQueries({ queryKey: ['patients'] })
    qc.invalidateQueries({ queryKey: ['patients-select'] })
    qc.invalidateQueries({ queryKey: ['waiting'] })
    onOpenChange(false)
  }

  function finishDelete() {
    toast.success(t('appt.deleted'))
    invalidateCalendarAppointments(qc, businessId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? t('appt.editTitle') : t('appt.newTitle')}</DialogTitle></DialogHeader>
        {!editing && micSupported && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
            <Button type="button" size="sm" variant={listening ? 'destructive' : 'outline'} onClick={toggleMic}>
              {listening ? <><MicOff className="mr-1.5 h-3.5 w-3.5" /> {t('appt.stop')}</> : <><Mic className="mr-1.5 h-3.5 w-3.5" /> {t('appt.dictate')}</>}
            </Button>
            <span className="text-xs text-muted-foreground">
              {listening ? t('appt.listening') : t('appt.dictateHint')}
            </span>
          </div>
        )}
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('appt.client')}</Label>
            <Select value={patientId} onValueChange={(v) => { setPatientId(v); setNewClient('') }}>
              <SelectTrigger><SelectValue placeholder={t('appt.selectClient')} /></SelectTrigger>
              <SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent>
            </Select>
            {!editing && <Input placeholder={t('appt.newClientPh')} value={newClient} onChange={(e) => { setNewClient(e.target.value); if (e.target.value) setPatientId('') }} />}
          </div>
          <div className="space-y-2">
            <Label>{t('appt.service')}</Label>
            <Select value={serviceId} onValueChange={onServiceChange}>
              <SelectTrigger><SelectValue placeholder={t('appt.noService')} /></SelectTrigger>
              <SelectContent><SelectItem value="none">{t('appt.noService')}</SelectItem>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.emoji ? s.emoji + ' ' : ''}{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <div className="space-y-2"><Label>{t('appt.date')}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('appt.start')}</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>{t('appt.duration')}</Label>
              {/* Native select → an iOS wheel; not keyboard-editable, stays compact. */}
              <select value={duration} onChange={(e) => setDuration(e.target.value)}
                className="flex h-9 w-24 rounded-md border border-input bg-transparent px-2 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm">
                {Array.from({ length: 200 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">{t('appt.availTitle')}</Label>
                <p className="text-xs text-muted-foreground">{t('appt.availHint')}</p>
              </div>
              <Switch checked={showAvail} onCheckedChange={setShowAvail} />
            </div>
            {showAvail && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium">{t('appt.onlyDays')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w, i) => (
                      <button key={w} type="button" onClick={() => toggle(availOnly, setAvailOnly, w)}
                        className={cn('rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors', availOnly.has(w) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}>
                        {dow[i]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium">{t('appt.neverDays')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w, i) => (
                      <button key={w} type="button" onClick={() => toggle(availNever, setAvailNever, w)}
                        className={cn('rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors', availNever.has(w) ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border bg-card hover:bg-accent')}>
                        {dow[i]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium">{t('appt.preferredTime')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([['any', 'appt.any'], ['morning', 'appt.morning'], ['afternoon', 'appt.afternoon']] as const).map(([val, key]) => {
                      const active = (val === 'any' && !preferred) || preferred === val
                      return (
                        <button key={val} type="button" onClick={() => setPreferred(val === 'any' ? null : (val as 'morning' | 'afternoon'))}
                          className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}>
                          {t(key)}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{t('appt.availNote')}</p>
              </div>
            )}
          </div>
          {!editing && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{t('appt.advanceTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('appt.advanceHint')}</p>
              </div>
              <Switch checked={advanceUp} onCheckedChange={setAdvanceUp} />
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {editing ? <Button variant="ghost" size="icon" className="text-destructive" onClick={() => del.mutate()}><Trash2 className="h-4 w-4" /></Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => save.mutate()} disabled={(!patientId && !newClient.trim()) || save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? t('common.save') : t('common.create')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
