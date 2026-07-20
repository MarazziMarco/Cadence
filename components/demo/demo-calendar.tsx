'use client'

// Public, DB-free demo calendar for the /demo landing flow. Visually mirrors
// components/calendar/calendar-client.tsx and the optimize-dialog preview UI,
// but runs entirely in memory: fixed fake appointments, client-side
// "optimization", no Supabase, no Edge Function.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Wand2, RotateCcw, Clock, ArrowRight, Sparkles, ArrowRightLeft, Check, Mic, MicOff, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { generateDemoWeek, demoWeekDays, type DemoAppointment } from '@/lib/demo/fixtures'
import { compactWeek, type DemoChange } from '@/lib/demo/compact'
import { parseAppointment } from '@/lib/voice/parse-appointment'
import { speechLang, useSpeech } from '@/lib/voice/use-speech'
import { usePublicT } from '@/lib/i18n/use-public-t'
import { bcp47 } from '@/lib/i18n'
import { DemoMovedMessages } from './demo-moved-messages'

const START_HOUR = 8, END_HOUR = 19, HOUR_H = 80
const LUNCH_START = 13 * 60, LUNCH_END = 14 * 60
const DEMO_PALETTE = ['#4f46e5', '#db2777', '#059669', '#d97706', '#0891b2', '#7c3aed']
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function fmt(min: number) { const h = Math.floor(min / 60), m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export function DemoCalendar() {
  const { t, locale } = usePublicT()
  const dateLocale = bcp47(locale)
  const days = useMemo(() => demoWeekDays(), [])
  const [appts, setAppts] = useState<DemoAppointment[]>(() => generateDemoWeek())
  const [preview, setPreview] = useState<{ changes: DemoChange[]; minutesRecovered: number } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [totalRecovered, setTotalRecovered] = useState(0)
  const [msgChanges, setMsgChanges] = useState<DemoChange[] | null>(null)
  // Changes the user unticked in the preview — excluded from the apply.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  // Day / week view (demo only). Day view scopes the optimizer to that day so
  // it's clearer what the optimizer does.
  const [view, setView] = useState<'day' | 'week'>('week')
  const [dayIdx, setDayIdx] = useState(() => {
    const wd = (new Date().getDay() + 6) % 7 // 0=Mon..6=Sun
    return Math.min(wd, 4)
  })

  // Voice add (Web Speech API + local parser, all in memory).
  const { supported: micSupported, listening, start: startRec, stop: stopRec } = useSpeech(speechLang(locale))
  const [transcript, setTranscript] = useState('')
  const [draft, setDraft] = useState<{ name: string; dateOffset: number; time: string; duration: number } | null>(null)

  const byDay = useMemo(() => {
    const map: Record<string, DemoAppointment[]> = {}
    appts.forEach((a) => { (map[a.date] = map[a.date] || []).push(a) })
    return map
  }, [appts])

  // Appointments the optimizer acts on: the selected day, or the whole week.
  function scopeAppts(): DemoAppointment[] {
    if (view === 'day') { const ds = ymd(days[dayIdx]); return appts.filter((a) => a.date === ds) }
    return appts
  }

  function handleOptimize() {
    const { changes, minutesRecovered } = compactWeek(scopeAppts())
    setPreview({ changes, minutesRecovered })
    setExcluded(new Set())
    setPreviewOpen(true)
  }

  function toggleExcluded(id: string) {
    setExcluded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function handleAccept() {
    // Apply only the moves the user kept ticked. Each demo change is an
    // independent pull-earlier within a block, so applying a subset is safe.
    const applied = (preview?.changes ?? []).filter((c) => !excluded.has(c.id))
    const moveMap = new Map(applied.map((c) => [c.id, c.newStart]))
    const recovered = applied.reduce((s, c) => s + (c.oldStart - c.newStart), 0)
    setMsgChanges(null)
    setPreviewOpen(false)
    // Apply first so the cards slide (CSS transition), then reveal the messages
    // panel a beat later so the move animation isn't immediately covered.
    setAppts((prev) => prev.map((a) => (moveMap.has(a.id) ? { ...a, startMin: moveMap.get(a.id)! } : a)))
    setTotalRecovered((t) => t + recovered)
    window.setTimeout(() => setMsgChanges(applied), 900)
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
    const name = r.patient.kind === 'existing' ? r.patient.displayName
      : r.patient.kind === 'new' ? r.patient.proposedName
      : r.patient.kind === 'ambiguous' ? r.patient.proposedName
      : ''
    let dateOffset = view === 'day' ? dayIdx : 0
    if (r.date) { const idx = days.findIndex((d) => ymd(d) === r.date); if (idx >= 0) dateOffset = Math.min(idx, 4) }
    setDraft({ name, dateOffset, time: r.time || '09:00', duration: r.durationMinutes || 30 })
  }

  function toggleMic() {
    if (listening) { stopRec(); return }
    setTranscript('')
    startRec(
      (text) => { setTranscript(text); applyVoice(text) },
      () => toast.error(t('demo.voiceError')),
    )
  }

  function addDraft() {
    if (!draft) return
    if (!draft.name.trim()) { toast.error(t('demo.needName')); return }
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
    toast.success(t('demo.added'))
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const todayStr = ymd(new Date())

  // Columns to render: single day, or the full week.
  const cols = view === 'day' ? [{ d: days[dayIdx], idx: dayIdx }] : days.map((d, idx) => ({ d, idx }))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('demo.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('demo.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">{totalRecovered}</span>
            <span className="text-muted-foreground">{t('demo.recovered')}</span>
          </div>
          <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" /> {t('demo.reset')}</Button>
        </div>
      </div>

      {/* View toggle + day navigation */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {view === 'day' && (
            <>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDayIdx((i) => Math.max(0, i - 1))} disabled={dayIdx === 0}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[9rem] text-center text-sm font-semibold">{days[dayIdx].toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric' })}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDayIdx((i) => Math.min(4, i + 1))} disabled={dayIdx === 4}><ChevronRight className="h-4 w-4" /></Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(['day', 'week'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{t(`demo.${v}`)}</button>
            ))}
          </div>
          <Button onClick={handleOptimize}><Wand2 className="mr-2 h-4 w-4" /> {view === 'day' ? t('demo.optimizeDay') : t('demo.optimize')}</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className={view === 'week' ? 'overflow-x-auto' : ''}>
          <div className={view === 'week' ? 'min-w-[760px] sm:min-w-0' : ''}>
            <div className="flex border-b border-border bg-muted/30">
              <div className="w-14 shrink-0" />
              {cols.map(({ d, idx }) => {
                const isToday = ymd(d) === todayStr
                const closed = idx >= 5
                return (
                  <div key={ymd(d)} className="flex-1 border-l border-border py-2 text-center">
                    <div className="text-xs text-muted-foreground">{d.toLocaleDateString(dateLocale, { weekday: 'short' })}</div>
                    <div className={cn('mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold', isToday && 'bg-primary text-primary-foreground')}>{d.getDate()}</div>
                    {closed && <div className="mt-0.5 text-[10px] text-muted-foreground">{t('demo.closed')}</div>}
                  </div>
                )
              })}
            </div>

            <div className="flex sm:max-h-[calc(100vh-20rem)] sm:overflow-y-auto">
              <div className="w-14 shrink-0">
                {hours.map((h) => <div key={h} className="relative" style={{ height: HOUR_H }}><span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</span></div>)}
              </div>
              {cols.map(({ d, idx }) => {
                const dateStr = ymd(d)
                const closed = idx >= 5
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
                      const height = Math.max(34, a.duration / 60 * HOUR_H - 3)
                      return (
                        <div key={a.id}
                          className="absolute left-1 right-1 overflow-hidden rounded-md border-l-2 px-2 py-1.5 text-left shadow-sm transition-all duration-500 ease-out"
                          style={{ top, height, backgroundColor: a.color + '1f', borderColor: a.color }}>
                          <p className="truncate text-[13px] font-semibold leading-tight sm:text-xs" style={{ color: a.color }}>{a.patientName}</p>
                          <p className="truncate text-[11px] leading-tight text-muted-foreground">{fmt(a.startMin)} · {a.duration}m</p>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Moved-messages panel appears below the calendar (and slightly delayed)
          so it doesn't cover the appointment move animation. */}
      {msgChanges && <DemoMovedMessages changes={msgChanges} onClose={() => setMsgChanges(null)} />}

      {/* Voice add — moved below the calendar. Free, in-memory (Web Speech API +
          local parser). Text input is always available as a fallback (HTTPS). */}
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Mic className="h-4 w-4 text-primary" /> {t('demo.voiceTitle')}</div>
        <p className="mb-3 text-sm text-muted-foreground">{t('demo.voiceDescription')}</p>
        <div className="flex flex-wrap items-center gap-3">
          {micSupported ? (
            <Button variant={listening ? 'destructive' : 'default'} onClick={toggleMic}>
              {listening ? <><MicOff className="mr-2 h-4 w-4" /> {t('voice.stop')}</> : <><Mic className="mr-2 h-4 w-4" /> {t('demo.dictate')}</>}
            </Button>
          ) : (
            <Badge variant="secondary">{t('demo.voiceUnavailable')}</Badge>
          )}
          {listening && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> {t('voice.listening')}</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder={t('voice.placeholder')} />
          <Button variant="outline" onClick={() => applyVoice(transcript)} disabled={!transcript.trim()}><Sparkles className="h-4 w-4" /></Button>
        </div>
        {draft && (
          <div className="mt-3 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
            <div className="space-y-1.5"><Label>{t('voice.client')}</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('demo.name')} /></div>
            <div className="space-y-1.5">
              <Label>{t('demo.day')}</Label>
              <Select value={String(draft.dateOffset)} onValueChange={(v) => setDraft({ ...draft, dateOffset: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{days.slice(0, 5).map((d, i) => <SelectItem key={i} value={String(i)}>{d.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric' })}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('voice.time')}</Label><Input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t('demo.duration')}</Label><Input type="number" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: parseInt(e.target.value) || 30 })} /></div>
            <div className="flex justify-end sm:col-span-4"><Button onClick={addDraft}><Plus className="mr-2 h-4 w-4" /> {t('demo.addToCalendar')}</Button></div>
          </div>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> {t('demo.previewTitle')}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(85vh-4rem)] overflow-y-auto p-5">
            {preview && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-accent/40 px-3 py-2.5 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    {preview.changes.length === 0
                      ? t('demo.alreadyOptimal')
                      : t(preview.changes.length === 1 ? 'demo.recoveredOne' : 'demo.recoveredMany', { minutes: preview.minutesRecovered, count: preview.changes.length })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground">{t('demo.idleTime')}</p><Clock className="h-3.5 w-3.5 text-primary" /></div>
                    <p className="mt-1 text-lg font-bold tracking-tight">{preview.minutesRecovered} min</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground">{t('demo.moved')}</p><ArrowRightLeft className="h-3.5 w-3.5 text-primary" /></div>
                    <p className="mt-1 text-lg font-bold tracking-tight">{preview.changes.length}</p>
                  </div>
                </div>

                {preview.changes.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-semibold">{t('demo.proposed', { count: preview.changes.length })}</p>
                    <p className="mb-2 text-xs text-muted-foreground">{t('demo.untick')}</p>
                    <div className="space-y-2">
                      {preview.changes.map((c) => (
                        <div key={c.id} className={cn('rounded-lg border border-border p-3 transition-opacity', excluded.has(c.id) && 'opacity-50')}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Checkbox checked={!excluded.has(c.id)} onCheckedChange={() => toggleExcluded(c.id)} aria-label={t('demo.includeMove', { name: c.patientName })} />
                              <Badge variant="secondary"><ArrowRightLeft className="mr-1 h-3 w-3" /> {t('demo.moved')}</Badge>
                              <span className="text-sm font-medium">{c.patientName}</span>
                            </div>
                            <span className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground line-through">{fmt(c.oldStart)}</span>
                              <ArrowRight className="h-3.5 w-3.5 text-primary" />
                              <span className="font-semibold text-primary">{fmt(c.newStart)}</span>
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-muted-foreground">{t('demo.movedEarlier', { minutes: c.oldStart - c.newStart })}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setPreviewOpen(false)}>{t('common.cancel')}</Button>
                  <Button onClick={handleAccept} disabled={preview.changes.filter((c) => !excluded.has(c.id)).length === 0}><Check className="mr-2 h-4 w-4" /> {t('demo.apply')}{preview.changes.length ? ` (${preview.changes.filter((c) => !excluded.has(c.id)).length})` : ''}</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
