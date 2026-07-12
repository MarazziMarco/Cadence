'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Mic, MicOff, Loader2, CalendarPlus, Sparkles } from 'lucide-react'
import { listPatientsForSelect, createAppointment } from '@/lib/api/appointments'
import { createPatient } from '@/lib/api/patients'
import { listServices } from '@/lib/api/services'
import { useWorkspace } from '@/lib/workspace-context'
import { parseAppointment, type ParsedAppt } from '@/lib/voice/parse-appointment'
import { useSpeech, speechLang } from '@/lib/voice/use-speech'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
    exampleList: ['Marco tomorrow at 3pm physiotherapy', 'Giulia on Friday at 10 checkup', 'Anna on the 20th at 2pm'],
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
    exampleList: ['Marco domani alle 15 fisioterapia', 'Giulia venerdì alle 10 visita di controllo', 'Anna il 20 alle 14'],
  },
} as const

function endTime(start: string, dur: number): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + dur
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}

function emptyParsed(): ParsedAppt {
  return { patientId: null, patientName: null, date: null, time: null, serviceId: null, serviceName: null, durationMinutes: null }
}

// Voice-driven appointment creation. Browser Web Speech API for transcription
// (free, native), then a local rule parser (no paid AI). Degrades gracefully:
// unsupported browsers or denied mic permission fall back to typed text.
export function VoiceAppointment() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const t = STR[business?.language === 'it' ? 'it' : 'en']

  const { data: patients = [] } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: !!businessId })
  const { data: services = [] } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: !!businessId })

  const { supported, listening, start, stop } = useSpeech(speechLang(business?.language))
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState<ParsedAppt | null>(null)
  const [newClient, setNewClient] = useState('')
  const [creating, setCreating] = useState(false)

  function applyParse(text: string) {
    setParsed(parseAppointment(text, patients as any, services as any))
  }

  function toggleMic() {
    if (listening) { stop(); return }
    setTranscript(''); setParsed(null); setNewClient('')
    start(
      (text) => { setTranscript(text); applyParse(text) },
      () => toast.error(t.micDenied),
    )
  }

  function set<K extends keyof ParsedAppt>(key: K, value: ParsedAppt[K]) {
    setParsed((p) => ({ ...(p ?? emptyParsed()), [key]: value }))
  }

  async function create() {
    if (!parsed?.date || !parsed?.time) { toast.error(t.needDateTime); return }
    if (!parsed.patientId && !newClient.trim()) { toast.error(t.needClient); return }
    const dur = parsed.durationMinutes ?? business?.default_appointment_duration ?? 30
    setCreating(true)
    try {
      // Existing client wins; otherwise create a new one from the typed name.
      let pid = parsed.patientId
      if (!pid && newClient.trim()) { const np = await createPatient(businessId, { first_name: newClient.trim() }); pid = np.id }
      await createAppointment(businessId, {
        patient_id: pid,
        service_id: parsed.serviceId,
        appointment_date: parsed.date,
        start_time: `${parsed.time}:00`,
        end_time: endTime(parsed.time, dur),
        duration_minutes: dur,
        price: services.find((s) => s.id === parsed.serviceId)?.price ?? null,
      })
      toast.success(t.created)
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['patients'] })
      qc.invalidateQueries({ queryKey: ['patients-select'] })
      setTranscript(''); setParsed(null); setNewClient('')
    } catch (e: any) {
      toast.error(e.message || t.createErr)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
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
            <Button type="button" variant="outline" onClick={() => applyParse(transcript)} disabled={!transcript.trim()}><Sparkles className="h-4 w-4" /></Button>
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

        {parsed && (
          <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t.client}</Label>
                <Select value={parsed.patientId ?? ''} onValueChange={(v) => { set('patientId', v); setNewClient('') }}>
                  <SelectTrigger><SelectValue placeholder={t.chooseClient} /></SelectTrigger>
                  <SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={newClient} onChange={(e) => { setNewClient(e.target.value); if (e.target.value) set('patientId', null) }} placeholder={t.newClientPh} />
              </div>
              <div className="space-y-1.5">
                <Label>{t.service}</Label>
                <Select value={parsed.serviceId ?? ''} onValueChange={(v) => { const s = services.find((x) => x.id === v); setParsed((p) => ({ ...(p ?? emptyParsed()), serviceId: v, durationMinutes: s?.duration_minutes ?? p?.durationMinutes ?? null })) }}>
                  <SelectTrigger><SelectValue placeholder={t.none} /></SelectTrigger>
                  <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>{t.date}</Label><Input type="date" value={parsed.date ?? ''} onChange={(e) => set('date', e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>{t.time}</Label><Input type="time" value={parsed.time ?? ''} onChange={(e) => set('time', e.target.value || null)} /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={create} disabled={creating}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} {t.create}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
