'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Mic, MicOff, Loader2, CalendarPlus, Sparkles } from 'lucide-react'
import { listPatientsForSelect, createAppointment, createAppointmentWithClient } from '@/lib/api/appointments'
import {
  confirmCalendarMutationInteractively,
  isCalendarWarningConfirmation,
} from '@/lib/api/calendar'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import {
  createPatient,
  updatePatient,
  createDefaultWeeklyAvailability,
  mergePatientWeeklyAvailability,
  replacePatientWeeklyAvailability,
  type WeeklyAvailability,
} from '@/lib/api/patients'
import { listServices } from '@/lib/api/services'
import { listWorkingHours } from '@/lib/api/working-hours'
import { WEEKDAYS, type Weekday } from '@/lib/types/db'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { bcp47 } from '@/lib/i18n'
import { parseAppointment, type ParsedAppt, type AvailabilityPatch } from '@/lib/voice/parse-appointment'
import { useSpeech, speechLang } from '@/lib/voice/use-speech'
import { AppointmentLocationFields, emptyLocation, type AppointmentLocationValue } from '@/components/calendar/appointment-location-fields'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function endTime(start: string, dur: number): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + dur
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}

function emptyParsed(): ParsedAppt {
  return { patient: { kind: 'none' }, date: null, time: null, serviceId: null, serviceName: null, durationMinutes: null, clientAddress: null, appointmentAddress: null, availability: null }
}

function splitName(name: string): { first_name: string; last_name: string | null } {
  const parts = name.trim().split(/\s+/)
  return { first_name: parts[0] || name, last_name: parts.length > 1 ? parts.slice(1).join(' ') : null }
}

// Turn a parsed availability patch into DB writes (merge, or replace = listed
// days keep their state, every other day becomes unavailable).
async function applyAvailability(pid: string, patch: AvailabilityPatch, workingHours: any[]): Promise<void> {
  if (patch.mode === 'replace') {
    const weekly = createDefaultWeeklyAvailability()
    for (const d of WEEKDAYS) weekly[d] = 'unavailable'
    for (const [d, state] of Object.entries(patch.days)) weekly[d as Weekday] = state!
    await replacePatientWeeklyAvailability(pid, weekly as WeeklyAvailability, workingHours)
  } else {
    await mergePatientWeeklyAvailability(pid, patch.days as Partial<WeeklyAvailability>, workingHours)
  }
}

// Voice-driven appointment creation. Browser Web Speech API for transcription
// (free, native), then a local rule parser (no paid AI). Degrades gracefully:
// unsupported browsers or denied mic permission fall back to typed text.
export function VoiceAppointment({
  initialTranscript,
}: {
  initialTranscript?: string
}) {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const examples = [t('voice.example1'), t('voice.example2'), t('voice.example3')]

  const { data: patients = [], isFetched: patientsFetched } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: !!businessId })
  const { data: services = [], isFetched: servicesFetched } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: !!businessId })
  const { data: workingHours = [] } = useQuery({ queryKey: ['working-hours', businessId], queryFn: () => listWorkingHours(businessId), enabled: !!businessId })

  const { supported, listening, start, stop } = useSpeech(speechLang(business?.language))
  const [transcript, setTranscript] = useState(initialTranscript ?? '')
  const [parsed, setParsed] = useState<ParsedAppt | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [ambiguousIds, setAmbiguousIds] = useState<string[]>([])
  const [clientAddr, setClientAddr] = useState('')
  const [updateClientAddr, setUpdateClientAddr] = useState(false)
  const [location, setLocation] = useState<AppointmentLocationValue>(emptyLocation())
  const [avail, setAvail] = useState<AvailabilityPatch | null>(null)
  const [creating, setCreating] = useState(false)
  const initialApplied = useRef(false)
  const confirmationOnly = !!initialTranscript

  function applyParse(text: string) {
    const p = parseAppointment(text, patients as any, services as any)
    setParsed(p)
    if (p.patient.kind === 'existing') { setSelectedId(p.patient.id); setNewName(''); setAmbiguousIds([]) }
    else if (p.patient.kind === 'new') { setNewName(p.patient.proposedName); setSelectedId(''); setAmbiguousIds([]) }
    else if (p.patient.kind === 'ambiguous') { setAmbiguousIds(p.patient.candidateIds); setSelectedId(''); setNewName('') }
    else { setSelectedId(''); setNewName(''); setAmbiguousIds([]) }
    setLocation(p.appointmentAddress ? { mode: 'custom', address: p.appointmentAddress, city: '', postalCode: '' } : emptyLocation())
    setClientAddr(p.clientAddress || '')
    setUpdateClientAddr(p.patient.kind === 'new' && !!p.clientAddress)
    setAvail(p.availability)
  }

  function reset() {
    setTranscript(''); setParsed(null); setSelectedId(''); setNewName(''); setAmbiguousIds([])
    setClientAddr(''); setUpdateClientAddr(false); setLocation(emptyLocation()); setAvail(null)
  }

  useEffect(() => {
    if (
      !initialTranscript ||
      initialApplied.current ||
      !patientsFetched ||
      !servicesFetched
    ) return

    initialApplied.current = true
    setTranscript(initialTranscript)
    applyParse(initialTranscript)
  }, [initialTranscript, patientsFetched, servicesFetched, patients, services])

  function toggleMic() {
    if (listening) { stop(); return }
    reset()
    start(
      (text) => { setTranscript(text); applyParse(text) },
      () => toast.error(t('voice.micDenied')),
    )
  }

  const patientReady = !!selectedId || !!newName.trim()

  async function create() {
    if (!parsed?.date || !parsed?.time) { toast.error(t('voice.needDateTime')); return }
    if (!patientReady) { toast.error(t('voice.needClient')); return }
    const dur = parsed.durationMinutes ?? business?.default_appointment_duration ?? 30
    setCreating(true)
    try {
      const appointment = {
        service_id: parsed.serviceId,
        appointment_date: parsed.date,
        start_time: `${parsed.time}:00`,
        end_time: endTime(parsed.time, dur),
        duration_minutes: dur,
        price: services.find((s) => s.id === parsed.serviceId)?.price ?? null,
        location_mode: location.mode,
        location_address: location.mode === 'custom' ? (location.address.trim() || null) : null,
        location_city: location.mode === 'custom' ? (location.city.trim() || null) : null,
        location_postal_code: location.mode === 'custom' ? (location.postalCode.trim() || null) : null,
      }
      let pid = selectedId
      if (!pid && newName.trim()) {
        // Atomic: the client is only persisted if the appointment is accepted.
        const parts = newName.trim().split(/\s+/)
        const created = await createAppointmentWithClient({
          businessId,
          patient: { firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(' ') : null, address: clientAddr.trim() || null },
          appointment,
        })
        if (!created) return // hard-cancelled soft warning
        pid = created.patient.id
      } else {
        if (pid && clientAddr.trim() && updateClientAddr) await updatePatient(pid, { address: clientAddr.trim() })
        try {
          await createAppointment(businessId, { patient_id: pid, ...appointment })
        } catch (error) {
          if (!isCalendarWarningConfirmation(error)) throw error
          const confirmed = await confirmCalendarMutationInteractively(error)
          if (!confirmed) return
        }
      }
      if (pid && avail) await applyAvailability(pid, avail, workingHours)
      toast.success(t('voice.created'))
      invalidateCalendarAppointments(qc, businessId)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['patients'] })
      qc.invalidateQueries({ queryKey: ['patients-select'] })
      reset()
    } catch {
      toast.error(t('voice.createError'))
    } finally {
      setCreating(false)
    }
  }

  const patientName = (id: string) => {
    const p = patients.find((x: any) => x.id === id)
    return p ? (p.full_name || p.first_name) : id
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        {!confirmationOnly ? (
          <>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Mic className="h-4 w-4 text-primary" /> {t('voice.title')}</div>
            <p className="mb-4 text-sm text-muted-foreground">{t('voice.description')}</p>

            <div className="flex flex-wrap items-center gap-3">
              {supported ? (
                <Button type="button" variant={listening ? 'destructive' : 'default'} onClick={toggleMic}>
                  {listening ? <><MicOff className="mr-2 h-4 w-4" /> {t('voice.stop')}</> : <><Mic className="mr-2 h-4 w-4" /> {t('voice.speak')}</>}
                </Button>
              ) : (
                <Badge variant="secondary">{t('voice.unavailable')}</Badge>
              )}
              {listening && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> {t('voice.listening')}</span>}
            </div>

            <div className="mt-4 space-y-2">
              <Label>{t('voice.text')} {supported ? t('voice.textHint') : ''}</Label>
              <div className="flex gap-2">
                <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={2} placeholder={t('voice.placeholder')} />
                <Button type="button" variant="outline" data-testid="voice-parse" aria-label={t('voice.examples')} onClick={() => applyParse(transcript)} disabled={!transcript.trim()}><Sparkles className="h-4 w-4" /></Button>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('voice.examples')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {examples.map((ex) => (
                    <button key={ex} type="button" onClick={() => { setTranscript(ex); applyParse(ex) }}
                      className="rounded-md border border-border bg-card px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">{ex}</button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label>{t('voice.text')}</Label>
            <Textarea value={transcript} readOnly rows={2} />
          </div>
        )}

        {parsed && (
          <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('voice.client')}</Label>
                {ambiguousIds.length > 0 && !selectedId ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-amber-600">{t('vp.ambiguous')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ambiguousIds.map((id) => (
                        <button key={id} type="button" onClick={() => { setSelectedId(id); setAmbiguousIds([]) }}
                          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-accent">{patientName(id)}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); setNewName(''); setAmbiguousIds([]) }}>
                      <SelectTrigger><SelectValue placeholder={t('voice.chooseClient')} /></SelectTrigger>
                      <SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={newName} onChange={(e) => { setNewName(e.target.value); if (e.target.value) setSelectedId('') }} placeholder={t('voice.newClient')} aria-label={t('vp.newClient')} />
                    {newName.trim() && !selectedId && <Badge variant="secondary" className="font-normal">{t('vp.newClient')}</Badge>}
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t('voice.service')}</Label>
                <Select value={parsed.serviceId ?? ''} onValueChange={(v) => { const s = services.find((x) => x.id === v); setParsed((p) => ({ ...(p ?? emptyParsed()), serviceId: v, durationMinutes: s?.duration_minutes ?? p?.durationMinutes ?? null })) }}>
                  <SelectTrigger><SelectValue placeholder={t('voice.none')} /></SelectTrigger>
                  <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>{t('voice.date')}</Label><Input type="date" value={parsed.date ?? ''} onChange={(e) => setParsed((p) => ({ ...(p ?? emptyParsed()), date: e.target.value || null }))} /></div>
              <div className="space-y-1.5"><Label>{t('voice.time')}</Label><Input type="time" value={parsed.time ?? ''} onChange={(e) => setParsed((p) => ({ ...(p ?? emptyParsed()), time: e.target.value || null }))} /></div>
            </div>

            <AppointmentLocationFields
              value={location}
              onChange={setLocation}
              patientAddress={selectedId ? (patients.find((p: any) => p.id === selectedId)?.address ?? null) : (clientAddr || null)}
            />

            {(clientAddr || parsed.clientAddress) && (
              <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
                <Label className="text-xs">{t('vp.clientAddress')}</Label>
                <Input value={clientAddr} onChange={(e) => setClientAddr(e.target.value)} />
                {selectedId && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={updateClientAddr} onCheckedChange={(v) => setUpdateClientAddr(v === true)} />
                    {t('vp.updateClientAddress')}
                  </label>
                )}
              </div>
            )}

            {avail && (
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('vp.availability')}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {Object.entries(avail.days).map(([d, state]) => (
                    <Badge key={d} variant="secondary" className="cursor-pointer font-normal" onClick={() => {
                      setAvail((a) => { if (!a) return a; const days = { ...a.days }; delete days[d as Weekday]; return Object.keys(days).length ? { ...a, days } : null })
                    }}>
                      {new Date(2024, 0, 1 + WEEKDAYS.indexOf(d as Weekday)).toLocaleDateString(dateLocale, { weekday: 'short' })}:{' '}
                      {state === 'unavailable' ? t('appt.neverDays')
                        : state === 'all_day' ? t('appt.any')
                        : state === 'morning_only' ? t('appt.morning')
                        : state === 'afternoon_only' ? t('appt.afternoon')
                        : state === 'prefer_morning' ? `${t('appt.preferredTime')}: ${t('appt.morning')}`
                        : `${t('appt.preferredTime')}: ${t('appt.afternoon')}`} ✕
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={create} disabled={creating || !patientReady}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} {t('voice.create')}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
