'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wand2, Loader2, Clock, DollarSign, ListChecks, ArrowRightLeft, ShieldCheck, Check, X, ArrowRight, Sparkles, PlusCircle, Star, CalendarClock, MoveHorizontal, ChevronsUp } from 'lucide-react'
import { runOptimization, fetchRun, ensureAlgorithmSettings, getAlgorithmSettings, saveAlgorithmSettings, saveAlgorithmMetadata } from '@/lib/api/scheduler'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HistoryClient } from '@/components/history/history-client'
import { OptimizePreview } from '@/components/calendar/optimize-preview'
import { FreePeriodDialog } from '@/components/calendar/free-period-dialog'
import type { FreePeriodKind } from '@/lib/api/scheduler'
import { OPTIMIZATION_STRATEGIES } from '@/lib/types/db'
import { CalendarX2 } from 'lucide-react'
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
  const { t } = useT()
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
  const [allowCrossWeek, setAllowCrossWeek] = useState(false)
  const [maxCrossWeekDays, setMaxCrossWeekDays] = useState(7)

  const [strategy, setStrategy] = useState<string>('balanced')
  const [fpOpen, setFpOpen] = useState(false)
  const [fpKind, setFpKind] = useState<FreePeriodKind>('day')

  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
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
        setStrategy(s.metadata?.OPTIMIZATION_STRATEGY === 'smart_route' ? 'smart_route' : 'balanced')
        setAllowCrossWeek(s.metadata?.ALLOW_CROSS_WEEK === true)
        setMaxCrossWeekDays(Math.min(
          31,
          Math.max(1, Number(s.metadata?.MAX_CROSS_WEEK_DAYS ?? 7)),
        ))
      })
      .catch(() => {})
  }, [businessId])

  function persist(patch: Record<string, unknown>) { saveAlgorithmSettings(businessId, patch).catch(() => {}) }
  const changeMode = (m: string) => { setMode(m); persist({ optimization_mode: m }) }
  const changeWaiting = (v: boolean) => { setIncludeWaitingList(v); persist({ allow_waiting_list: v }) }
  const changeVips = (v: boolean) => { setProtectVips(v); persist({ weight_vip: v ? 100 : 0 }) }
  const changePreferred = (v: boolean) => { setRespectPreferred(v); persist({ weight_patient_preference: v ? 5 : 0 }) }
  const changeAdvance = (v: boolean) => { setPrioritizeAdvance(v); saveAlgorithmMetadata(businessId, { PRIORITIZE_ADVANCE: v }).catch(() => {}) }
  const changeStrategy = (v: string) => { setStrategy(v); saveAlgorithmMetadata(businessId, { OPTIMIZATION_STRATEGY: v }).catch(() => {}) }
  const openFree = (kind: FreePeriodKind) => { setFpKind(kind); setFpOpen(true) }
  const changeCrossWeek = (v: boolean) => {
    setAllowCrossWeek(v)
    saveAlgorithmMetadata(businessId, { ALLOW_CROSS_WEEK: v }).catch(() => {})
  }
  const changeMaxCrossWeekDays = (value: number) => {
    const next = Math.min(31, Math.max(1, Math.round(value || 1)))
    setMaxCrossWeekDays(next)
    saveAlgorithmMetadata(businessId, {
      MAX_CROSS_WEEK_DAYS: next,
    }).catch(() => {})
  }

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
      setPreviewOpen(true) // always show the result in a modal (even if 0 changes)
    } catch (e: any) { toast.error(e.message || t('opt.failed')) }
    finally { setLoading(false) }
  }

  const idleSaved = run ? Math.max(0, (run.idle_minutes_before ?? 0) - (run.idle_minutes_after ?? 0)) : 0
  const revImpact = run ? Number(run.estimated_revenue_after ?? 0) - Number(run.estimated_revenue_before ?? 0) : 0
  const kpis = run ? [
    { label: t('sched.kpi.idleSaved'), value: `${Math.floor(idleSaved / 60)}h ${idleSaved % 60}m`, icon: Clock, tone: 'text-success' },
    { label: t('sched.kpi.revenueImpact'), value: `+${formatMoney(revImpact, business?.currency)}`, icon: DollarSign, tone: 'text-success' },
    { label: t('sched.kpi.waitingFilled'), value: String(run.created_appointments ?? 0), icon: ListChecks, tone: 'text-primary' },
    { label: t('sched.kpi.apptsMoved'), value: String(run.moved_appointments ?? 0), icon: ArrowRightLeft, tone: 'text-primary' },
  ] : []

  const toggles = [
    { on: includeWaitingList, set: changeWaiting, icon: ListChecks, title: t('sched.tg.waiting.title'), desc: t('sched.tg.waiting.desc') },
    { on: protectVips, set: changeVips, icon: Star, title: t('sched.tg.vips.title'), desc: t('sched.tg.vips.desc') },
    { on: respectPreferred, set: changePreferred, icon: CalendarClock, title: t('sched.tg.preferred.title'), desc: t('sched.tg.preferred.desc') },
    { on: prioritizeAdvance, set: changeAdvance, icon: ChevronsUp, title: t('sched.tg.advance.title'), desc: t('sched.tg.advance.desc') },
    { on: allowCrossWeek, set: changeCrossWeek, icon: MoveHorizontal, title: t('sched.tg.crossWeek.title'), desc: t('sched.tg.crossWeek.desc') },
  ]

  return (
    <div>
      <PageHeader title={t('sched.title')} description={t('sched.subtitle')} />

      {/* Legend — what it does and the rules it never breaks */}
      <Card className="mb-6 border-primary/20 bg-accent/20 shadow-sm">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {t('sched.whatItDoes')}</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><MoveHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t('sched.wd1')}</li>
              <li className="flex gap-2"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t('sched.wd2')}</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t('sched.wd3')}</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-success" /> {t('sched.rulesNeverBreak')}</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t('sched.rb1')}</li>
              <li className="flex gap-2"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t('sched.rb2')}</li>
              <li className="flex gap-2"><ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t('sched.rb3')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 shadow-sm">
        <CardContent className="space-y-5 p-5">
          {/* Time range */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2">
              <Label>{t('sched.range')}</Label>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {RANGES.map((r) => (
                  <button key={r.value} onClick={() => setRange(r.value)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', range === r.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('sched.range.' + r.value)}</button>
                ))}
              </div>
            </div>
            {range === 'custom' ? (
              <>
                <div className="space-y-2"><Label>{t('sched.from')}</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="sm:w-44" /></div>
                <div className="space-y-2"><Label>{t('sched.to')}</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="sm:w-44" /></div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>{range === 'week' ? t('sched.weekOf') : t('sched.dayToOptimize')}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-48" />
                {range === 'week' && <p className="text-xs text-muted-foreground">{t('sched.from')} {dateFrom} — {t('sched.to')} {dateTo}</p>}
              </div>
            )}
            <Button onClick={optimize} disabled={loading || !businessId || (range === 'custom' && (!customFrom || !customTo || customFrom > customTo))} className="sm:ml-auto">{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} {t('sched.optimize')}</Button>
          </div>

          {/* Free a day / afternoon (operates on the picked day) */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openFree('day')} disabled={!businessId}><CalendarX2 className="mr-1.5 h-4 w-4" /> {t('fp.freeDay')}</Button>
            <Button variant="outline" size="sm" onClick={() => openFree('afternoon')} disabled={!businessId}><CalendarX2 className="mr-1.5 h-4 w-4" /> {t('fp.freeAfternoon')}</Button>
          </div>

          {/* Route strategy */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label>{t('route.settings')}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPTIMIZATION_STRATEGIES.map((s) => (
                <button key={s} onClick={() => changeStrategy(s)}
                  className={cn('rounded-xl border p-3 text-left transition-colors', strategy === s ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}>
                  <p className={cn('text-sm font-semibold', strategy === s && 'text-primary')}>{t('route.' + s)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('route.' + s + 'Desc')}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label>{t('sched.howAggressive')}</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button key={m.value} onClick={() => changeMode(m.value)}
                  className={cn('rounded-xl border p-3 text-left transition-colors', mode === m.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}>
                  <p className={cn('text-sm font-semibold', mode === m.value && 'text-primary')}>{t('sched.mode.' + m.value)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('sched.mode.' + m.value + '.desc')}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label>{t('sched.rulesPriorities')}</Label>
            <div className="divide-y divide-border rounded-xl border border-border">
              {toggles.map((tg) => (
                <div key={tg.title} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-start gap-2">
                    <tg.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div><p className="text-sm font-medium">{tg.title}</p><p className="text-xs text-muted-foreground">{tg.desc}</p></div>
                  </div>
                  <Switch checked={tg.on} onCheckedChange={tg.set} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('sched.savedNote')}</p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div>
                <Label htmlFor="max-cross-week-days">
                  {t('sched.maxDisplacement')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('sched.maxDisplacementDesc')}
                </p>
              </div>
              <Input
                id="max-cross-week-days"
                type="number"
                min={1}
                max={31}
                value={maxCrossWeekDays}
                disabled={!allowCrossWeek}
                onChange={(event) => changeMaxCrossWeekDays(
                  Number(event.target.value),
                )}
                className="w-24"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result always shown in a modal (same UX as the calendar Optimize) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> {t('opt.title')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(85vh-4rem)] overflow-y-auto p-5">
            {run && <OptimizePreview businessId={businessId} run={run} changes={changes} />}
          </div>
        </DialogContent>
      </Dialog>

      {businessId && <FreePeriodDialog businessId={businessId} date={date} kind={fpKind} open={fpOpen} onOpenChange={setFpOpen} />}

      {/* Optimization history + undo, right here on the Scheduler */}
      <div className="mt-10 border-t border-border pt-6">
        <HistoryClient embedded />
      </div>
    </div>
  )
}
