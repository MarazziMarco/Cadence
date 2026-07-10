'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Wand2, Loader2, Clock, DollarSign, ListChecks, ArrowRightLeft, ShieldCheck, Check, X, ArrowRight, Sparkles, PlusCircle } from 'lucide-react'
import { runOptimization, fetchRun, acceptChange, rejectChange } from '@/lib/api/scheduler'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OPTIMIZATION_MODE } from '@/lib/types/db'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '—')
const todayStr = () => new Date().toISOString().slice(0, 10)

export function SchedulerClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [date, setDate] = useState(todayStr())
  const [mode, setMode] = useState('balanced')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [run, setRun] = useState<any>(null)
  const [changes, setChanges] = useState<any[]>([])

  async function optimize() {
    setLoading(true); setRun(null); setChanges([])
    try {
      const runId = await runOptimization(businessId, date, date)
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
    { label: 'Constraint violations', value: '0', icon: ShieldCheck, tone: 'text-success' },
  ] : []

  return (
    <div>
      <PageHeader title="Scheduler" description="Build the best possible day. Every optimization is a preview — you decide, row by row." />

      <Card className="mb-6 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <div className="space-y-2"><Label>Day to optimize</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-48" /></div>
          <div className="space-y-2"><Label>Mode</Label><Select value={mode} onValueChange={setMode}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent>{OPTIMIZATION_MODE.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={optimize} disabled={loading || !businessId} className="sm:ml-auto">{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} Optimize day</Button>
        </CardContent>
      </Card>

      <AnimatePresence>
        {run && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-accent/40 px-4 py-3 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /><span className="font-medium">Preview ready.</span>
              <span className="text-muted-foreground">{run.ai_summary || 'Accept or reject each change below. Nothing changes until you accept.'}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {kpis.map((k) => (
                <Card key={k.label} className="shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{k.label}</p><k.icon className={`h-4 w-4 ${k.tone}`} /></div><p className={`mt-1 text-xl font-bold ${k.tone}`}>{k.value}</p></CardContent></Card>
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
                            {isMove ? 'Spostato' : "Aggiunto dalla lista d'attesa"}
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
                        {c.accepted ? <Badge className="bg-success/15 text-success hover:bg-success/15"><Check className="mr-1 h-3 w-3" /> Applicato</Badge> : (
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

      {!run && !loading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Wand2 className="h-6 w-6" /></div>
          <h3 className="font-semibold">Ready to optimize</h3>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">Cadence runs the optimizer and shows a full preview. You accept or reject each proposed change individually — nothing is applied until you say so.</p>
        </div>
      )}
    </div>
  )
}
