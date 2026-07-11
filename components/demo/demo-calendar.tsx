'use client'

// Public, DB-free demo calendar for the /demo landing flow. Visually mirrors
// components/calendar/calendar-client.tsx and the optimize-dialog preview UI,
// but runs entirely in memory: fixed fake appointments, client-side
// "optimization", no Supabase, no Edge Function.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Wand2, RotateCcw, Clock, ArrowRight, Sparkles, ArrowRightLeft, Check, Mic, MicOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { generateDemoWeek, demoWeekDays, DOW_LABELS, type DemoAppointment } from '@/lib/demo/fixtures'
import { compactWeek, type DemoChange } from '@/lib/demo/compact'
import { parseAppointment } from '@/lib/voice/parse-appointment'
import { useSpeech } from '@/lib/voice/use-speech'
import { DemoMovedMessages } from './demo-moved-messages'

const START_HOUR = 8, END_HOUR = 19, HOUR_H = 56
const LUNCH_START = 13 * 60, LUNCH_END = 14 * 60
const DEMO_PALETTE = ['#4f46e5', '#db2777', '#059669', '#d97706', '#0891b2', '#7c3aed']

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function fmt(min: number) { const h = Math.floor(min / 60), m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export function DemoCalendar() {
  const days = useMemo(() => demoWeekDays(), [])
  const [appts, setAppts] = useState<DemoAppointment[]>(() => generateDemoWeek())
  const [preview, setPreview] = useState<{ changes: DemoChange[]; minutesRecovered: number } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [totalRecovered, setTotalRecovered] = useState(0)
  const [msgChanges, setMsgChanges] = useState<DemoChange[] | null>(null)

  // Voice add (Web Speech API + local parser, all in memory).
  const { supported: micSupported, listening, start: startRec, stop: stopRec } = useSpeech('it-IT')
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<{ name: string; dateOffset: number; time: string; duration: number } | null>(null)

  const byDay = useMemo(() => {
    const map: Record<string, DemoAppointment[]> = {}
    appts.forEach((a) => { (map[a.date] = map[a.date] || []).push(a) })
    return map
  }, [appts])

  function handleOptimize() {
    const { changes, minutesRecovered } = compactWeek(appts)
    setPreview({ changes, minutesRecovered })
    setPreviewOpen(true)
  }

  function handleAccept() {
    const { compacted, minutesRecovered } = compactWeek(appts)
    setAppts(compacted)
    setTotalRecovered((t) => t + minutesRecovered)
    setPreviewOpen(false)
    // Auto-open the "prepare messages" panel for the patients that moved.
    setMsgChanges(preview?.changes ?? [])
  }

  function handleReset() {
    setAppts(generateDemoWeek())
    setTotalRecovered(0)
    setPreview(null)
    setPreviewOpen(false)
    setMsgChanges(null)
    setDraft(null)
    setTranscript('')
  }

  // Parse a dictated/typed phrase into a draft appointment. Patients are derived
  // from the current in-memory names so dictating an existing client matches.
  function applyVoice(text: string) {
    const seen = new Set<string>()
    const patients = appts
      .map((a) => a.patientName)
      .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
      .map((n) => ({ id: n, first_name: n.split(' ')[0], last_name: n.split(' ').slice(1).join(' ') || null, full_name: n }))
    const r = parseAppointment(text, patients, [])
    let dateOffset = 0
    if (r.date) { const idx = days.findIndex((d) => ymd(d) === r.date); if (idx >= 0) dateOffset = Math.min(idx, 4) }
    setDraft({ name: r.patientName || '', dateOffset, time: r.time || '09:00', duration: r.durationMinutes || 30 })
  }

  function toggleMic() {
    if (listening) { stopRec(); return }
    setTranscript('')
    startRec(
      (text) => { setTranscript(text); applyVoice(text) },
      () => toast.error('Microfono non disponibile (richiede HTTPS). Scrivi la frase qui sotto.'),
    )
  }

  function addDraft() {
    if (!draft) return
    if (!draft.name.trim()) { toast.error('Inserisci un nome cliente'); return }
    const date = ymd(days[draft.dateOffset])
    const appt: DemoAppointment = {
      id: `voice-${Date.now()}`,
      patientName: draft.name.trim(),
      color: DEMO_PALETTE[appts.length % DEMO_PALETTE.length],
      date,
      weekdayOffset: draft.dateOffset,
      startMin: toMin(draft.time),
      duration: draft.duration || 30,
    }
    setAppts((prev) => [...prev, appt])
    setDraft(null)
    setTranscript('')
    toast.success('Appuntamento aggiunto al calendario demo')
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const todayStr = ymd(new Date())

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Calendario demo</h1>
          <p className="text-sm text-muted-foreground">Settimana di prova, precaricata con appuntamenti finti.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">{totalRecovered}</span>
            <span className="text-muted-foreground">min di tempo morto recuperati</span>
          </div>
          <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" /> Reset demo</Button>
          <Button onClick={handleOptimize}><Wand2 className="mr-2 h-4 w-4" /> Ottimizza</Button>
        </div>
      </div>

      {/* Voice add — free, in-memory (Web Speech API + local parser). Text input
          is always available as fallback (mic needs HTTPS). */}
      <div className="mb-4 rounded-xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Mic className="h-4 w-4 text-primary" /> Aggiungi un appuntamento a voce</div>
        <p className="mb-3 text-sm text-muted-foreground">Detta ad es. “Marco martedì alle 15”. Tutto resta in memoria — niente salvataggio.</p>
        <div className="flex flex-wrap items-center gap-3">
          {micSupported ? (
            <Button variant={listening ? 'destructive' : 'default'} onClick={toggleMic}>
              {listening ? <><MicOff className="mr-2 h-4 w-4" /> Stop</> : <><Mic className="mr-2 h-4 w-4" /> Detta</>}
            </Button>
          ) : (
            <Badge variant="secondary">Microfono non disponibile — usa il testo</Badge>
          )}
          {listening && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> In ascolto…</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Es. Giulia venerdì alle 10" />
          <Button variant="outline" onClick={() => applyVoice(transcript)} disabled={!transcript.trim()}><Sparkles className="h-4 w-4" /></Button>
        </div>
        {draft && (
          <div className="mt-3 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
            <div className="space-y-1.5"><Label>Cliente</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nome" /></div>
            <div className="space-y-1.5">
              <Label>Giorno</Label>
              <Select value={String(draft.dateOffset)} onValueChange={(v) => setDraft({ ...draft, dateOffset: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{days.slice(0, 5).map((d, i) => <SelectItem key={i} value={String(i)}>{DOW_LABELS[i]} {d.getDate()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Ora</Label><Input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Durata (min)</Label><Input type="number" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: parseInt(e.target.value) || 30 })} /></div>
            <div className="flex justify-end sm:col-span-4"><Button onClick={addDraft}><Plus className="mr-2 h-4 w-4" /> Aggiungi al calendario</Button></div>
          </div>
        )}
      </div>

      {msgChanges && <DemoMovedMessages changes={msgChanges} onClose={() => setMsgChanges(null)} />}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex border-b border-border bg-muted/30">
          <div className="w-14 shrink-0" />
          {days.map((d, i) => {
            const isToday = ymd(d) === todayStr
            const closed = i >= 5
            return (
              <div key={ymd(d)} className="flex-1 border-l border-border py-2 text-center">
                <div className="text-xs text-muted-foreground">{DOW_LABELS[i]}</div>
                <div className={cn('mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold', isToday && 'bg-primary text-primary-foreground')}>{d.getDate()}</div>
                {closed && <div className="mt-0.5 text-[10px] text-muted-foreground">Chiuso</div>}
              </div>
            )
          })}
        </div>

        <div className="flex max-h-[calc(100vh-20rem)] overflow-y-auto">
          <div className="w-14 shrink-0">
            {hours.map((h) => <div key={h} className="relative" style={{ height: HOUR_H }}><span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</span></div>)}
          </div>
          {days.map((d, i) => {
            const dateStr = ymd(d)
            const closed = i >= 5
            return (
              <div key={dateStr} className="relative flex-1 border-l border-border" style={{ height: (END_HOUR - START_HOUR) * HOUR_H }}>
                {hours.map((h) => <div key={h} className="border-b border-border/60" style={{ height: HOUR_H }} />)}
                {closed ? (
                  <div className="absolute inset-0 bg-muted/20" />
                ) : (
                  <div className="absolute inset-x-0 bg-muted/40" style={{ top: (LUNCH_START - START_HOUR * 60) / 60 * HOUR_H, height: (LUNCH_END - LUNCH_START) / 60 * HOUR_H }} />
                )}
                {(byDay[dateStr] || []).map((a) => {
                  const top = (a.startMin - START_HOUR * 60) / 60 * HOUR_H
                  const height = Math.max(18, a.duration / 60 * HOUR_H - 2)
                  return (
                    <div key={a.id}
                      className="absolute left-1 right-1 overflow-hidden rounded-md border-l-2 px-2 py-1 text-left shadow-sm transition-all duration-500 ease-out"
                      style={{ top, height, backgroundColor: a.color + '1f', borderColor: a.color }}>
                      <p className="truncate text-xs font-semibold" style={{ color: a.color }}>{a.patientName}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{fmt(a.startMin)} · {a.duration}m</p>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Ottimizzazione (demo)</DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(85vh-4rem)] overflow-y-auto p-5">
            {preview && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-accent/40 px-3 py-2.5 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    {preview.changes.length === 0
                      ? 'Agenda già ottimale nel periodo mostrato.'
                      : `Recuperati ${preview.minutesRecovered} min di tempo morto spostando ${preview.changes.length} appuntamenti.`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground">Tempo morto</p><Clock className="h-3.5 w-3.5 text-primary" /></div>
                    <p className="mt-1 text-lg font-bold tracking-tight">{preview.minutesRecovered} min</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground">Spostati</p><ArrowRightLeft className="h-3.5 w-3.5 text-primary" /></div>
                    <p className="mt-1 text-lg font-bold tracking-tight">{preview.changes.length}</p>
                  </div>
                </div>

                {preview.changes.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Modifiche proposte ({preview.changes.length})</p>
                    <div className="space-y-2">
                      {preview.changes.map((c) => (
                        <div key={c.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary"><ArrowRightLeft className="mr-1 h-3 w-3" /> Spostato</Badge>
                              <span className="text-sm font-medium">{c.patientName}</span>
                            </div>
                            <span className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground line-through">{fmt(c.oldStart)}</span>
                              <ArrowRight className="h-3.5 w-3.5 text-primary" />
                              <span className="font-semibold text-primary">{fmt(c.newStart)}</span>
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-muted-foreground">Anticipato di {c.oldStart - c.newStart} min per chiudere il buco.</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setPreviewOpen(false)}>Annulla</Button>
                  <Button onClick={handleAccept} disabled={preview.changes.length === 0}><Check className="mr-2 h-4 w-4" /> Applica</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
