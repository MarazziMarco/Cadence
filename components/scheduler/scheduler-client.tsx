'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wand2, Loader2, Clock, DollarSign, ListChecks, ArrowRightLeft, ShieldCheck, Check, X, ArrowRight, Sparkles, PlusCircle, Star, CalendarClock, MoveHorizontal, ChevronsUp } from 'lucide-react'
import { runOptimization, fetchRun, acceptChange, rejectChange, ensureAlgorithmSettings, getAlgorithmSettings, saveAlgorithmSettings, saveAlgorithmMetadata } from '@/lib/api/scheduler'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { HistoryClient } from '@/components/history/history-client'
import { cn } from '@/lib/utils'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '—')
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const startOfWeek = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const todayStr = () => ymd(new Date())

const RANGES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'custom', label: 'Custom' },
] as const
type Range = (typeof RANGES)[number]['value']

const MODES = [
  { value: 'conservative', label: 'Conservative', desc: 'Move as few appointments as possible.' },
  { value: 'balanced', label: 'Balanced', desc: 'A sensible trade-off (recommended).' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Pack the day as tight as possible.' },
]

export function SchedulerClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [range, setRange] = useState<Range>('day')
  const [date, setDate] = useState(todayStr())
  const [customFrom, setCustomFrom] = useState(todayStr())
  const [customTo, setCustomTo] = useState(todayStr())

  // Saved algorithm knobs — reused by the quick "Optimize" everywhere.
  const [mode, setMode] = useState('balanced')
  const [includeWaitingList, setIncludeWaitingList] = useState(false)
  const [protectVips, setProtectVips] = useState(true)
  const [respectPreferred, setRespectPreferred] = useState(true)
  const [prioritizeAdvance, setPrioritizeAdvance] = useState(true)

  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [run, setRun] = useState<any>(null)
  const [changes, setChanges] = useState<any[]>([])

  // Load saved settings so the page reflects (and edits) what the optimizer uses.
  useEffect(() => {
    if (!businessId) return
    ensureAlgorithmSettings(businessId)
      .then(() => getAlgorithmSettings(businessId))
      .then((s: any) => {
        if (!s) return
        if (s.optimization_mode) setMode(s.optimization_mode)
        setIncludeWaitingList(!!s.allow_waiting_list)
        setProtectVips((s.weight_vip ?? 100) > 0)
        setRespectPreferred((s.weight_patient_preference ?? 5) > 0)
        setPrioritizeAdvance((s.metadata?.PRIORITIZE_ADVANCE ?? true) !== false)
      })
      .catch(() => {})
  }, [businessId])

  function persist(patch: Record<string, unknown>) { saveAlgorithmSettings(businessId, patch).catch(() => {}) }
  const changeMode = (m: string) => { setMode(m); persist({ optimization_mode: m }) }
  const changeWaiting = (v: boolean) => { setIncludeWaitingList(v); persist({ allow_waiting_list: v }) }
  const changeVips = (v: boolean) => { setProtectVips(v); persist({ weight_vip: v ? 100 : 0 }) }
  const changePreferred = (v: boolean) => { setRespectPreferred(v); persist({ weight_patient_preference: v ? 5 : 0 }) }
  const changeAdvance = (v: boolean) => { setPrioritizeAdvance(v); saveAlgorithmMetadata(businessId, { PRIORITIZE_ADVANCE: v }).catch(() => {}) }

  const [dateFrom, dateTo] = range === 'day' ? [date, date]
    : range === 'week' ? (() => { const s = startOfWeek(parseYmd(date)); return [ymd(s), ymd(addDays(s, 6))] })()
    : [customFrom, customTo]

  async function optimize() {
    setLoading(true); setRun(null); setChanges([])
    try {
      // Settings already persisted on change; the Edge Function reads them.
      const runId = await runOptimization(businessId, dateFrom, dateTo)
      const res = await fetchRun(runId)
      setRun(res.run); setChanges(res.changes)
      if (res.changes.length === 0) toast.info('Already optimal — no beneficial changes found.')
    } catch (e: any) { toast.error(e.message || 'Optimization failed') }
    finally { setLoading(false) }
  }

  async function onAccept(c: any) {
    setBusyId(c.id)
    try {
      await acceptChange(businessId, run.id, c)
      setChanges((prev) => prev.map((x) => (x.id === c.id ? { ...x, accepted: true } : x)))
      qc.invalidateQueries({ queryKey: ['appointments'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['waiting'] })
      toast.success('Applied')
    } catch (e: any) { toast.error(e.message) } finally { setBusyId(null) }
  }
  async function onReject(c: any) {
    setBusyId(c.id)
    try { await rejectChange(c); setChanges((prev) => prev.filter((x) => x.id !== c.id)); toast('Change dismissed') }
    catch (e: any) { toast.error(e.message) } finally { setBusyId(null) }
  }

  const idleSaved = run ? Math.max(0, (run.idle_minutes_before ?? 0) - (run.idle_minutes_after ?? 0)) : 0
  const revImpact = run ? Number(run.estimated_revenue_after ?? 0) - Number(run.estimated_revenue_before ?? 0) : 0
  const kpis = run ? [
    { label: 'Idle time saved', value: `${Math.floor(idleSaved / 60)}h ${idleSaved % 60}m`, icon: Clock, tone: 'text-success' },
    { label: 'Revenue impact', value: `+${formatMoney(revImpact, business?.currency)}`, icon: DollarSign, tone: 'text-success' },
    { label: 'Waiting list filled', value: String(run.created_appointments ?? 0), icon: ListChecks, tone: 'text-primary' },
    { label: 'Appointments moved', value: String(run.moved_appointments ?? 0), icon: ArrowRightLeft, tone: 'text-primary' },
  ] : []

  const toggles = [
    { on: includeWaitingList, set: changeWaiting, icon: ListChecks, title: 'Fill from waiting list', desc: 'Insert waiting-list clients into freed slots.' },
    { on: protectVips, set: changeVips, icon: Star, title: 'Protect VIPs', desc: 'Avoid moving your VIP clients when possible.' },
    { on: respectPreferred, set: changePreferred, icon: CalendarClock, title: 'Respect preferred times', desc: "Keep clients within their preferred hours where they set them." },
    { on: prioritizeAdvance, set: changeAdvance, icon: ChevronsUp, title: 'Prioritize move-up requests', desc: 'When a gap frees up, first pull in clients who asked to be moved earlier.' },
  ]

  return (
    <div>
      <PageHeader title="Scheduler" description="Tune how the optimizer works, then preview and apply — nothing changes until you accept." />

      {/* Legend — what it does and the rules it never breaks */}
      <Card className="mb-6 border-primary/20 bg-accent/20 shadow-sm">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> What it does</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><MoveHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Pulls appointments earlier to close the gaps between them.</li>
              <li className="flex gap-2"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Optionally fills the freed slots with waiting-list clients.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Every change is a preview — you accept or reject each one.</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-success" /> Rules it never breaks</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Working hours &amp; lunch break.</li>
              <li className="flex gap-2"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Each client's availability — the days/hours they can (or can't) come.</li>
              <li className="flex gap-2"><ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-success" /> No overlaps; idle time never increases.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 shadow-sm">
        <CardContent className="space-y-5 p-5">
          {/* Time range */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2">
              <Label>Range</Label>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {RANGES.map((r) => (
                  <button key={r.value} onClick={() => setRange(r.value)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', range === r.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{r.label}</button>
                ))}
              </div>
            </div>
            {range === 'custom' ? (
              <>
                <div className="space-y-2"><Label>From</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="sm:w-44" /></div>
                <div className="space-y-2"><Label>To</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="sm:w-44" /></div>
              </>
            ) : (
              <div className="space-y-2"><Label>{range === 'week' ? 'Week of' : 'Day to optimize'}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-48" /></div>
            )}
            <Button onClick={optimize} disabled={loading || !businessId || (range === 'custom' && (!customFrom || !customTo || customFrom > customTo))} className="sm:ml-auto">{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} Optimize</Button>
          </div>

          {/* Mode */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label>How aggressive?</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button key={m.value} onClick={() => changeMode(m.value)}
                  className={cn('rounded-xl border p-3 text-left transition-colors', mode === m.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}>
                  <p className={cn('text-sm font-semibold', mode === m.value && 'text-primary')}>{m.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label>Rules &amp; priorities</Label>
            <div className="divide-y divide-border rounded-xl border border-border">
              {toggles.map((t) => (
                <div key={t.title} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-start gap-2">
                    <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{t.desc}</p></div>
                  </div>
                  <Switch checked={t.on} onCheckedChange={t.set} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">These settings are saved and reused everywhere — including the quick “Optimize” from the calendar and dashboard.</p>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {run && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-accent/40 px-4 py-3 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /><span className="font-medium">Preview ready.</span>
              <span className="text-muted-foreground">{run.ai_summary || 'Accept or reject each change below. Nothing changes until you accept.'}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {kpis.map((k) => (
                <Card key={k.label} className="shadow-sm"><CardContent className="p-3.5"><div className="flex items-start justify-between gap-2"><p className="text-xs text-muted-foreground">{k.label}</p><k.icon className={`h-4 w-4 shrink-0 ${k.tone}`} /></div><p className={`mt-1.5 text-lg font-bold ${k.tone}`}>{k.value}</p></CardContent></Card>
              ))}
            </div>

            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base">Proposed changes ({changes.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {changes.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No changes proposed.</p> : changes.map((c) => {
                  const isMove = !!c.appointment_id
                  const name = c.patients?.full_name || c.patients?.first_name || 'Client'
                  return (
                    <div key={c.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={isMove ? 'secondary' : 'default'} className={isMove ? '' : 'bg-success/15 text-success hover:bg-success/15'}>
                            {isMove ? <ArrowRightLeft className="mr-1 h-3 w-3" /> : <PlusCircle className="mr-1 h-3 w-3" />}
                            {isMove ? 'Moved' : 'Added from waiting list'}
                          </Badge>
                          <span className="font-medium">{name}</span>
                        </div>
                        {isMove ? (
                          <span className="flex items-center gap-2 text-sm"><span className="text-muted-foreground line-through">{hhmm(c.old_start_time)}</span><ArrowRight className="h-3.5 w-3.5 text-primary" /><span className="font-semibold text-primary">{hhmm(c.new_start_time)}</span></span>
                        ) : (
                          <Badge className="bg-success/10 text-success hover:bg-success/10">{c.new_date} · {hhmm(c.new_start_time)}</Badge>
                        )}
                      </div>
                      {c.ai_reason && <p className="mt-1.5 text-xs text-muted-foreground">{c.ai_reason}</p>}
                      <div className="mt-2 flex justify-end gap-2">
                        {c.accepted ? <Badge className="bg-success/15 text-success hover:bg-success/15"><Check className="mr-1 h-3 w-3" /> Applied</Badge> : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => onReject(c)} disabled={busyId === c.id}><X className="mr-1 h-3.5 w-3.5" /> Reject</Button>
                            <Button size="sm" onClick={() => onAccept(c)} disabled={busyId === c.id}>{busyId === c.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Accept</Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Optimization history + undo, right here on the Scheduler */}
      <div className="mt-10 border-t border-border pt-6">
        <HistoryClient embedded />
      </div>
    </div>
  )
}
