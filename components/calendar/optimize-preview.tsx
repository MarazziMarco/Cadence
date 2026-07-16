'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, DollarSign, ListChecks, ArrowRightLeft, Check, ArrowRight, Sparkles, PlusCircle, Loader2 } from 'lucide-react'
import { applyChanges } from '@/lib/api/scheduler'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { MovedMessages } from './moved-messages'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '—')

// Shared optimize result view (used by the Scheduler modal and the calendar
// OptimizeDialog). Every change starts SELECTED; the user unticks the ones to
// skip, then a SINGLE "Apply" button applies all selected at once.
export function OptimizePreview({ businessId, run, changes, onApplied }: {
  businessId: string
  run: any
  changes: any[]
  onApplied?: () => void
}) {
  const { business } = useWorkspace()
  const { t } = useT()
  const qc = useQueryClient()
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [appliedChanges, setAppliedChanges] = useState<any[] | null>(null)

  const idleSaved = run ? Math.max(0, (run.idle_minutes_before ?? 0) - (run.idle_minutes_after ?? 0)) : 0
  const revImpact = run ? Number(run.estimated_revenue_after ?? 0) - Number(run.estimated_revenue_before ?? 0) : 0
  const kpis = [
    { label: t('opt.kpi.idle'), value: `${Math.floor(idleSaved / 60)}h ${idleSaved % 60}m`, icon: Clock },
    { label: t('opt.kpi.revenue'), value: `+${formatMoney(revImpact, business?.currency)}`, icon: DollarSign },
    { label: t('opt.kpi.waiting'), value: String(run?.created_appointments ?? 0), icon: ListChecks },
    { label: t('opt.kpi.moved'), value: String(run?.moved_appointments ?? 0), icon: ArrowRightLeft },
  ]

  const selectedCount = useMemo(() => changes.filter((c) => !excluded.has(c.id)).length, [changes, excluded])
  function toggle(id: string) {
    setExcluded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function apply() {
    setApplying(true)
    try {
      const applied = await applyChanges(businessId, run.id, changes, excluded)
      invalidateCalendarAppointments(qc, businessId)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['waiting'] })
      qc.invalidateQueries({ queryKey: ['schedule-health'] })
      qc.invalidateQueries({ queryKey: ['optimizations'] })
      setAppliedChanges(applied.map((c) => ({ ...c, accepted: true })))
      toast.success(t('opt.applied', { n: applied.length }))
      onApplied?.()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setApplying(false)
    }
  }

  // Post-apply state: show the copy-paste messages for the moved clients.
  if (appliedChanges) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm">
          <Check className="h-4 w-4 shrink-0 text-success" />
          <span className="font-medium">{t('opt.applied', { n: appliedChanges.length })}</span>
        </div>
        <MovedMessages businessId={businessId} changes={appliedChanges} />
      </div>
    )
  }

  if (changes.length === 0) {
    return <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">{t('opt.alreadyOptimal')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-accent/40 px-3 py-2.5 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">{run?.ai_summary || t('sched.previewDefault')}</span>
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
        <p className="mb-1 text-sm font-semibold">{t('sched.proposedChanges', { n: changes.length })}</p>
        <p className="mb-2 text-xs text-muted-foreground">{t('opt.excludeHint')}</p>
        <div className="space-y-2">
          {changes.map((c) => {
            const isMove = !!c.appointment_id
            const name = c.patients?.full_name || c.patients?.first_name || t('dash.client')
            const on = !excluded.has(c.id)
            return (
              <div key={c.id} className={cnRow(on)}>
                <Checkbox checked={on} onCheckedChange={() => toggle(c.id)} className="mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={isMove ? 'secondary' : 'default'} className={isMove ? '' : 'bg-success/15 text-success hover:bg-success/15'}>
                        {isMove ? <ArrowRightLeft className="mr-1 h-3 w-3" /> : <PlusCircle className="mr-1 h-3 w-3" />}
                        {isMove ? t('sched.moved') : t('opt.fromWaiting')}
                      </Badge>
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                    {isMove ? (
                      <span className="flex items-center gap-2 text-sm"><span className="text-muted-foreground line-through">{hhmm(c.old_start_time)}</span><ArrowRight className="h-3.5 w-3.5 text-primary" /><span className="font-semibold text-primary">{hhmm(c.new_start_time)}</span></span>
                    ) : (
                      <Badge className="bg-success/10 text-success hover:bg-success/10">{c.new_date} · {hhmm(c.new_start_time)}</Badge>
                    )}
                  </div>
                  {c.ai_reason && <p className="mt-1 text-xs text-muted-foreground">{c.ai_reason}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-5 border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
        <Button className="w-full" size="lg" onClick={apply} disabled={applying || selectedCount === 0}>
          {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          {selectedCount === 0 ? t('opt.applyNone') : t('opt.apply', { n: selectedCount })}
        </Button>
      </div>
    </div>
  )
}

function cnRow(on: boolean): string {
  return `flex items-start gap-3 rounded-lg border p-3 transition-colors ${on ? 'border-border' : 'border-dashed border-border/60 opacity-55'}`
}
