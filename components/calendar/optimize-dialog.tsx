'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wand2, Loader2, Clock, DollarSign, ListChecks, ArrowRightLeft, Check, X, ArrowRight, Sparkles, PlusCircle } from 'lucide-react'
import { runOptimization, fetchRun, acceptChange, rejectChange, ensureAlgorithmSettings } from '@/lib/api/scheduler'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { MovedMessages } from './moved-messages'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '—')

// Calendar-side entry point for the intelligent optimizer. It reuses the exact
// Scheduler flow (Edge Function invoke + preview + per-row apply) via lib/api/scheduler.
export function OptimizeDialog({ businessId, dateFrom, dateTo }: { businessId: string; dateFrom: string; dateTo: string }) {
  const { business } = useWorkspace()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [run, setRun] = useState<any>(null)
  const [changes, setChanges] = useState<any[]>([])

  async function optimize() {
    setLoading(true); setRun(null); setChanges([])
    try {
      await ensureAlgorithmSettings(businessId)
      const runId = await runOptimization(businessId, dateFrom, dateTo)
      const res = await fetchRun(runId)
      setRun(res.run); setChanges(res.changes)
    } catch (e: any) {
      toast.error(e.message || 'Ottimizzazione non riuscita')
    } finally { setLoading(false) }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (v) { setRun(null); setChanges([]); optimize() }
  }

  async function onAccept(c: any) {
    setBusyId(c.id)
    try {
      await acceptChange(businessId, run.id, c)
      setChanges((prev) => prev.map((x) => (x.id === c.id ? { ...x, accepted: true } : x)))
      qc.invalidateQueries({ queryKey: ['appointments'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['waiting'] })
      toast.success('Applicato')
    } catch (e: any) { toast.error(e.message) } finally { setBusyId(null) }
  }
  async function onReject(c: any) {
    setBusyId(c.id)
    try { await rejectChange(c); setChanges((prev) => prev.filter((x) => x.id !== c.id)); toast('Modifica scartata') }
    catch (e: any) { toast.error(e.message) } finally { setBusyId(null) }
  }

  const idleSaved = run ? Math.max(0, (run.idle_minutes_before ?? 0) - (run.idle_minutes_after ?? 0)) : 0
  const revImpact = run ? Number(run.estimated_revenue_after ?? 0) - Number(run.estimated_revenue_before ?? 0) : 0
  const kpis = run ? [
    { label: 'Tempo morto', value: `${Math.floor(idleSaved / 60)}h ${idleSaved % 60}m`, icon: Clock },
    { label: 'Ricavi', value: `+${formatMoney(revImpact, business?.currency)}`, icon: DollarSign },
    { label: "Lista d'attesa", value: String(run.created_appointments ?? 0), icon: ListChecks },
    { label: 'Spostati', value: String(run.moved_appointments ?? 0), icon: ArrowRightLeft },
  ] : []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Wand2 className="h-4 w-4" /> Ottimizza</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Ottimizzazione intelligente</DialogTitle>
        </DialogHeader>

        <div className="max-h-[calc(85vh-4rem)] overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Sto costruendo la giornata migliore…</p>
            </div>
          )}

          {!loading && run && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-accent/40 px-3 py-2.5 text-sm">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{run.ai_summary || 'Ogni modifica è un\'anteprima. Nulla cambia finché non accetti.'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {kpis.map((k) => (
                  <div key={k.label} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground">{k.label}</p><k.icon className="h-3.5 w-3.5 text-primary" /></div>
                    <p className="mt-1 text-lg font-bold tracking-tight">{k.value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Modifiche proposte ({changes.length})</p>
                {changes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Agenda già ottimale nel periodo selezionato.</div>
                ) : (
                  <div className="space-y-2">
                    {changes.map((c) => {
                      const isMove = !!c.appointment_id
                      const name = c.patients?.full_name || c.patients?.first_name || 'Cliente'
                      return (
                        <div key={c.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={isMove ? 'secondary' : 'default'} className={isMove ? '' : 'bg-success/15 text-success hover:bg-success/15'}>
                                {isMove ? <ArrowRightLeft className="mr-1 h-3 w-3" /> : <PlusCircle className="mr-1 h-3 w-3" />}
                                {isMove ? 'Spostato' : "Da lista d'attesa"}
                              </Badge>
                              <span className="text-sm font-medium">{name}</span>
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
                                <Button size="sm" variant="outline" onClick={() => onReject(c)} disabled={busyId === c.id}><X className="mr-1 h-3.5 w-3.5" /> Rifiuta</Button>
                                <Button size="sm" onClick={() => onAccept(c)} disabled={busyId === c.id}>{busyId === c.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Accetta</Button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <MovedMessages businessId={businessId} changes={changes} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
