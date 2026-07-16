'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { History, Clock, Undo2, Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOptimizationHistory, undoLastOptimization } from '@/lib/api/optimization-history'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { bcp47 } from '@/lib/i18n'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/common/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

function fmtMinutes(min: number): string {
  if (min <= 0) return '0 min'
  const h = Math.floor(min / 60), m = min % 60
  return h ? `${h}h ${m}m` : `${m} min`
}
function fmtDateTime(iso: string, dloc: string): string {
  try { return new Intl.DateTimeFormat(dloc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) } catch { return iso }
}
function fmtRange(from: string | null, to: string | null, dloc: string): string | null {
  if (!from) return null
  const f = (d: string) => { try { return new Intl.DateTimeFormat(dloc, { day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00')) } catch { return d } }
  return from === to || !to ? f(from) : `${f(from)} – ${f(to)}`
}

export function HistoryClient({ embedded = false }: { embedded?: boolean } = {}) {
  const { business } = useWorkspace()
  const { t, locale } = useT()
  const dloc = bcp47(locale)
  const businessId = business?.id ?? ''
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['optimizations', businessId], queryFn: () => getOptimizationHistory(businessId), enabled: !!businessId })
  const runs = data?.runs ?? []
  const summary = data?.summary
  const canUndo = runs.some((r) => r.appliedCount > 0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const undo = useMutation({
    mutationFn: () => undoLastOptimization(businessId),
    onSuccess: (res) => {
      if (res.undone === 0) toast(t('hist.nothingUndo'))
      else toast.success(t('hist.reverted', { n: res.undone }))
      qc.invalidateQueries({ queryKey: ['optimizations'] })
      invalidateCalendarAppointments(qc, businessId)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['schedule-health'] })
    },
    onError: (e: any) => toast.error(e.message || t('hist.undoFailed')),
  })

  const undoButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="lg" className="w-full font-bold tracking-wide sm:w-auto" disabled={!canUndo || undo.isPending}>
          {undo.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />} {t('hist.undoBtn')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('hist.undoTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('hist.undoDesc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => undo.mutate()}>{t('hist.undo')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <div>
      {embedded ? (
        <h2 className="mb-4 text-xl font-bold tracking-tight">{t('hist.title')}</h2>
      ) : (
        <PageHeader title={t('hist.title')} description={t('hist.subtitle')} />
      )}

      {/* Undo — prominent, right above the history */}
      <div className="mb-6">
        {undoButton}
        {!canUndo && <p className="mt-2 text-xs text-muted-foreground">{t('hist.nothingYet')}</p>}
      </div>

      {/* Aggregate summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: t('hist.recoveredWeek'), value: fmtMinutes(summary?.weekRecovered ?? 0), icon: Clock },
          { label: t('hist.recoveredTotal'), value: fmtMinutes(summary?.totalRecovered ?? 0), icon: Sparkles },
          { label: t('hist.runs'), value: String(summary?.runCount ?? 0), icon: History },
        ].map((s) => (
          <Card key={s.label} className="shadow-sm"><CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-muted-foreground">{s.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{isLoading ? '—' : s.value}</p></div>
            <s.icon className="h-5 w-5 text-primary" />
          </CardContent></Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : runs.length === 0 ? (
        <EmptyState icon={History} title={t('hist.emptyTitle')} description={t('hist.emptyDesc')} />
      ) : (
        <div className="space-y-2">
          {runs.map((r) => {
            const open = expanded.has(r.id)
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card shadow-sm">
                {/* Compact summary — click to expand this run's details */}
                <button onClick={() => toggle(r.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{fmtDateTime(r.created_at, dloc)}</p>
                      <p className="truncate text-xs text-muted-foreground">{t('hist.recovered', { v: fmtMinutes(r.idleRecovered) })} · {t('hist.moved', { n: r.moved })}{r.created > 0 ? ` · ${t('hist.fromWaiting', { n: r.created })}` : ''}</p>
                    </div>
                  </div>
                  {r.appliedCount > 0 && <Badge className="shrink-0 bg-success/15 text-success hover:bg-success/15">{t('hist.applied')}</Badge>}
                </button>
                {open && (
                  <div className="border-t border-border p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {fmtRange(r.rangeFrom, r.rangeTo, dloc) && <Badge variant="secondary">{fmtRange(r.rangeFrom, r.rangeTo, dloc)}</Badge>}
                      <Badge variant="secondary" className="capitalize">{r.mode}</Badge>
                      <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" /> {t('hist.recovered', { v: fmtMinutes(r.idleRecovered) })}</Badge>
                      <Badge variant="secondary">{t('hist.moved', { n: r.moved })}</Badge>
                      {r.created > 0 && <Badge variant="secondary">{t('hist.fromWaiting', { n: r.created })}</Badge>}
                    </div>
                    {r.ai_summary && <p className="mt-2 text-sm text-muted-foreground">{r.ai_summary}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
