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

// Interface strings — English by default, Italian only when the business
// language is set to Italian (Settings > Preferences).
const STR = {
  en: {
    title: 'Create appointment by voice',
    desc: 'Dictate, e.g. “Marco tomorrow at 3pm physiotherapy”. Transcription is free and runs in your browser — no paid service.',
    speak: 'Speak', stop: 'Stop', listening: 'Listening…',
    unavailable: 'Voice unavailable — type instead',
    text: 'Text', textHint: '(or type manually)',
    placeholder: 'e.g. Giulia on Friday at 10 checkup',
    examples: 'Try an example',
    client: 'Client', service: 'Service', date: 'Date', time: 'Time',
    chooseClient: 'Choose client', none: 'None', create: 'Create appointment',
    newClientPh: '…or type a new client name',
    needClient: 'Select or enter a client', needDateTime: 'Date and time are required',
    created: 'Appointment created', createErr: 'Could not create the appointment',
    micDenied: 'Microphone permission denied. Type the text below.',
    micFail: 'Could not start the microphone.',
    exampleList: ['Marco tomorrow at 3pm physiotherapy', 'Giulia on Friday at 10 checkup', 'Anna, only Mondays, prefers mornings'],
  },
  it: {
    title: 'Crea appuntamento a voce',
    desc: 'Detta, ad es. “Marco domani alle 15 fisioterapia”. La trascrizione è gratuita e locale al browser — nessun servizio a pagamento.',
    speak: 'Parla', stop: 'Stop', listening: 'In ascolto…',
    unavailable: 'Voce non disponibile — usa il testo',
    text: 'Testo', textHint: '(o scrivi manualmente)',
    placeholder: 'Es. Giulia venerdì alle 10 visita di controllo',
    examples: 'Prova un esempio',
    client: 'Cliente', service: 'Servizio', date: 'Data', time: 'Ora',
    chooseClient: 'Scegli cliente', none: 'Nessuno', create: 'Crea appuntamento',
    newClientPh: '…o scrivi un nuovo cliente',
    needClient: 'Seleziona o inserisci un cliente', needDateTime: 'Data e ora sono obbligatorie',
    created: 'Appuntamento creato', createErr: 'Errore nella creazione',
    micDenied: 'Permesso microfono negato. Scrivi il testo qui sotto.',
    micFail: 'Impossibile avviare il microfono.',
    exampleList: ['Marco domani alle 15 fisioterapia', 'Giulia venerdì alle 10 visita di controllo', 'Anna solo il lunedì, preferisce la mattina'],
  },
} as const

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
  const t = STR[business?.language === 'it' ? 'it' : 'en']
  const { t: tr } = useT()

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
      () => toast.error(t.micDenied),
    )
  }

  const patientReady = !!selectedId || !!newName.trim()

  async function create() {
    if (!parsed?.date || !parsed?.time) { toast.error(t.needDateTime); return }
    if (!patientReady) { toast.error(t.needClient); return }
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
      toast.success(t.created)
      invalidateCalendarAppointments(qc, businessId)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['patients'] })
      qc.invalidateQueries({ queryKey: ['patients-select'] })
      reset()
    } catch (e: any) {
      toast.error(e.message || t.createErr)
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
            <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Mic className="h-4 w-4 text-primary" /> {t.title}</div>
            <p className="mb-4 text-sm text-muted-foreground">{t.desc}</p>

            <div className="flex flex-wrap items-center gap-3">
              {supported ? (
                <Button type="button" variant={listening ? 'destructive' : 'default'} onClick={toggleMic}>
                  {listening ? <><MicOff className="mr-2 h-4 w-4" /> {t.stop}</> : <><Mic className="mr-2 h-4 w-4" /> {t.speak}</>}
                </Button>
              ) : (
                <Badge variant="secondary">{t.unavailable}</Badge>
              )}
              {listening && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> {t.listening}</span>}
            </div>

            <div className="mt-4 space-y-2">
              <Label>{t.text} {supported ? t.textHint : ''}</Label>
              <div className="flex gap-2">
                <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={2} placeholder={t.placeholder} />
                <Button type="button" variant="outline" data-testid="voice-parse" aria-label="Parse text" onClick={() => applyParse(transcript)} disabled={!transcript.trim()}><Sparkles className="h-4 w-4" /></Button>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t.examples}</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.exampleList.map((ex) => (
                    <button key={ex} type="button" onClick={() => { setTranscript(ex); applyParse(ex) }}
                      className="rounded-md border border-border bg-card px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">{ex}</button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label>{t.text}</Label>
            <Textarea value={transcript} readOnly rows={2} />
          </div>
        )}

        {parsed && (
          <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t.client}</Label>
                {ambiguousIds.length > 0 && !selectedId ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-amber-600">{tr('vp.ambiguous')}</p>
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
                      <SelectTrigger><SelectValue placeholder={t.chooseClient} /></SelectTrigger>
                      <SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={newName} onChange={(e) => { setNewName(e.target.value); if (e.target.value) setSelectedId('') }} placeholder={t.newClientPh} aria-label={tr('vp.newClient')} />
                    {newName.trim() && !selectedId && <Badge variant="secondary" className="font-normal">{tr('vp.newClient')}</Badge>}
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t.service}</Label>
                <Select value={parsed.serviceId ?? ''} onValueChange={(v) => { const s = services.find((x) => x.id === v); setParsed((p) => ({ ...(p ?? emptyParsed()), serviceId: v, durationMinutes: s?.duration_minutes ?? p?.durationMinutes ?? null })) }}>
                  <SelectTrigger><SelectValue placeholder={t.none} /></SelectTrigger>
                  <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>{t.date}</Label><Input type="date" value={parsed.date ?? ''} onChange={(e) => setParsed((p) => ({ ...(p ?? emptyParsed()), date: e.target.value || null }))} /></div>
              <div className="space-y-1.5"><Label>{t.time}</Label><Input type="time" value={parsed.time ?? ''} onChange={(e) => setParsed((p) => ({ ...(p ?? emptyParsed()), time: e.target.value || null }))} /></div>
            </div>

            <AppointmentLocationFields
              value={location}
              onChange={setLocation}
              patientAddress={selectedId ? (patients.find((p: any) => p.id === selectedId)?.address ?? null) : (clientAddr || null)}
            />

            {(clientAddr || parsed.clientAddress) && (
              <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/30 p-2.5">
                <Label className="text-xs">{tr('vp.clientAddress')}</Label>
                <Input value={clientAddr} onChange={(e) => setClientAddr(e.target.value)} />
                {selectedId && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={updateClientAddr} onCheckedChange={(v) => setUpdateClientAddr(v === true)} />
                    {tr('vp.updateClientAddress')}
                  </label>
                )}
              </div>
            )}

            {avail && (
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{tr('vp.availability')}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {Object.entries(avail.days).map(([d, state]) => (
                    <Badge key={d} variant="secondary" className="cursor-pointer font-normal" onClick={() => {
                      setAvail((a) => { if (!a) return a; const days = { ...a.days }; delete days[d as Weekday]; return Object.keys(days).length ? { ...a, days } : null })
                    }}>{d.slice(0, 3)}: {state} ✕</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={create} disabled={creating || !patientReady}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} {t.create}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
