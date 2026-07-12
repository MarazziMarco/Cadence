'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { History, Clock, ArrowRightLeft, PlusCircle, Undo2, Loader2, Sparkles } from 'lucide-react'
import { getOptimizationHistory, undoLastOptimization } from '@/lib/api/optimization-history'
import { useWorkspace } from '@/lib/workspace-context'
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
function fmtDateTime(iso: string): string {
  try { return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) } catch { return iso }
}
function fmtRange(from: string | null, to: string | null): string | null {
  if (!from) return null
  const f = (d: string) => { try { return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00')) } catch { return d } }
  return from === to || !to ? f(from) : `${f(from)} – ${f(to)}`
}

export function HistoryClient({ embedded = false }: { embedded?: boolean } = {}) {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['optimizations', businessId], queryFn: () => getOptimizationHistory(businessId), enabled: !!businessId })
  const runs = data?.runs ?? []
  const summary = data?.summary
  const canUndo = runs.some((r) => r.appliedCount > 0)

  const undo = useMutation({
    mutationFn: () => undoLastOptimization(businessId),
    onSuccess: (res) => {
      if (res.undone === 0) toast('Nothing to undo')
      else toast.success(`Reverted ${res.undone} appointment${res.undone === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['optimizations'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['schedule-health'] })
    },
    onError: (e: any) => toast.error(e.message || 'Undo failed'),
  })

  const undoButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={!canUndo || undo.isPending}>
          {undo.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />} Undo last optimization
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo the last optimization?</AlertDialogTitle>
          <AlertDialogDescription>
            This moves every appointment from the most recent applied optimization back to its previous time. Waiting-list inserts from that run are removed. This can't be redone automatically.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => undo.mutate()}>Undo</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <div>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold tracking-tight">Optimization history</h2>
          {undoButton}
        </div>
      ) : (
        <PageHeader title="Optimization history" description="Every optimization Cadence has run for your business." actions={undoButton} />
      )}

      {/* Aggregate summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Recovered this week', value: fmtMinutes(summary?.weekRecovered ?? 0), icon: Clock },
          { label: 'Recovered total', value: fmtMinutes(summary?.totalRecovered ?? 0), icon: Sparkles },
          { label: 'Optimizations run', value: String(summary?.runCount ?? 0), icon: History },
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
        <EmptyState icon={History} title="No optimizations yet" description="Once you run an optimization from the Scheduler or Calendar, it will show up here." />
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <Card key={r.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{fmtDateTime(r.created_at)}</span>
                    {fmtRange(r.rangeFrom, r.rangeTo) && <Badge variant="secondary">{fmtRange(r.rangeFrom, r.rangeTo)}</Badge>}
                    <Badge variant="secondary" className="capitalize">{r.mode}</Badge>
                    {r.appliedCount > 0 && <Badge className="bg-success/15 text-success hover:bg-success/15">Applied</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold tabular-nums">{fmtMinutes(r.idleRecovered)}</span>
                    <span className="text-muted-foreground">recovered</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><ArrowRightLeft className="h-3.5 w-3.5" /> {r.moved} moved</span>
                  {r.created > 0 && <span className="inline-flex items-center gap-1"><PlusCircle className="h-3.5 w-3.5" /> {r.created} from waiting list</span>}
                </div>
                {r.ai_summary && <p className="mt-2 text-sm text-muted-foreground">{r.ai_summary}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
