'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Mic, MicOff, Loader2, CalendarPlus, Sparkles } from 'lucide-react'
import { listPatientsForSelect, createAppointment } from '@/lib/api/appointments'
import { listServices } from '@/lib/api/services'
import { useWorkspace } from '@/lib/workspace-context'
import { parseAppointment, type ParsedAppt } from '@/lib/voice/parse-appointment'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function endTime(start: string, dur: number): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + dur
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}

// Voice-driven appointment creation. Browser Web Speech API for transcription
// (free, native), then a local rule parser (no paid AI). Degrades gracefully:
// unsupported browsers or denied mic permission fall back to typed text.
export function VoiceAppointment() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()

  const { data: patients = [] } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: !!businessId })
  const { data: services = [] } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: !!businessId })

  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState<ParsedAppt | null>(null)
  const [creating, setCreating] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SR = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    if (!SR) { setSupported(false); return }
    const rec = new SR()
    rec.lang = 'it-IT'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript as string
      setTranscript(text)
      applyParse(text)
    }
    rec.onerror = (e: any) => {
      setListening(false)
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error('Permesso microfono negato. Scrivi il testo qui sotto.')
        setSupported(false)
      } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
        toast.error('Riconoscimento vocale non riuscito. Riprova o scrivi il testo.')
      }
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    return () => { try { rec.abort() } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-parse when reference lists arrive (in case parse ran before they loaded).
  function applyParse(text: string) {
    setParsed(parseAppointment(text, patients as any, services as any))
  }

  function toggleMic() {
    const rec = recognitionRef.current
    if (!rec) { setSupported(false); return }
    if (listening) { try { rec.stop() } catch {}; setListening(false); return }
    setTranscript(''); setParsed(null)
    try { rec.start(); setListening(true) }
    catch { toast.error('Impossibile avviare il microfono.') }
  }

  function set<K extends keyof ParsedAppt>(key: K, value: ParsedAppt[K]) {
    setParsed((p) => ({ ...(p ?? emptyParsed()), [key]: value }))
  }

  async function create() {
    if (!parsed?.patientId) { toast.error('Seleziona un cliente'); return }
    if (!parsed.date || !parsed.time) { toast.error('Data e ora sono obbligatorie'); return }
    const dur = parsed.durationMinutes ?? business?.default_appointment_duration ?? 30
    setCreating(true)
    try {
      await createAppointment(businessId, {
        patient_id: parsed.patientId,
        service_id: parsed.serviceId,
        appointment_date: parsed.date,
        start_time: `${parsed.time}:00`,
        end_time: endTime(parsed.time, dur),
        duration_minutes: dur,
      })
      toast.success('Appuntamento creato')
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setTranscript(''); setParsed(null)
    } catch (e: any) {
      toast.error(e.message || 'Errore nella creazione')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card className="mt-6 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Mic className="h-4 w-4 text-primary" /> Crea appuntamento a voce</div>
        <p className="mb-4 text-sm text-muted-foreground">Detta, ad es. “Marco domani alle 15 fisioterapia”. La trascrizione è gratuita e locale al browser; nessun servizio a pagamento.</p>

        <div className="flex flex-wrap items-center gap-3">
          {supported ? (
            <Button type="button" variant={listening ? 'destructive' : 'default'} onClick={toggleMic}>
              {listening ? <><MicOff className="mr-2 h-4 w-4" /> Stop</> : <><Mic className="mr-2 h-4 w-4" /> Parla</>}
            </Button>
          ) : (
            <Badge variant="secondary">Voce non disponibile — usa il testo</Badge>
          )}
          {listening && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> In ascolto…</span>}
        </div>

        <div className="mt-4 space-y-2">
          <Label>Testo {supported ? '(o scrivi manualmente)' : ''}</Label>
          <div className="flex gap-2">
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={2} placeholder="Es. Giulia venerdì alle 10 visita di controllo" />
            <Button type="button" variant="outline" onClick={() => applyParse(transcript)} disabled={!transcript.trim()}><Sparkles className="h-4 w-4" /></Button>
          </div>
        </div>

        {parsed && (
          <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={parsed.patientId ?? ''} onValueChange={(v) => set('patientId', v)}>
                  <SelectTrigger><SelectValue placeholder="Scegli cliente" /></SelectTrigger>
                  <SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Servizio</Label>
                <Select value={parsed.serviceId ?? ''} onValueChange={(v) => { const s = services.find((x) => x.id === v); setParsed((p) => ({ ...(p ?? emptyParsed()), serviceId: v, durationMinutes: s?.duration_minutes ?? p?.durationMinutes ?? null })) }}>
                  <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={parsed.date ?? ''} onChange={(e) => set('date', e.target.value || null)} /></div>
              <div className="space-y-1.5"><Label>Ora</Label><Input type="time" value={parsed.time ?? ''} onChange={(e) => set('time', e.target.value || null)} /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={create} disabled={creating}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Crea appuntamento</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function emptyParsed(): ParsedAppt {
  return { patientId: null, patientName: null, date: null, time: null, serviceId: null, serviceName: null, durationMinutes: null }
}
