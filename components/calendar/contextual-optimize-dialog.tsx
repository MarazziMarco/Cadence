'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import {
  applyOptimizationBatch,
  ensureAlgorithmSettings,
  fetchRun,
  getAlgorithmSettings,
  runContextualOptimization,
  type ContextualOptimizationRequest,
} from '@/lib/api/scheduler'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { useT } from '@/lib/i18n/use-t'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MovedMessages } from './moved-messages'

interface ContextualOptimizeDialogProps {
  businessId: string
  scope: ContextualOptimizationRequest['scope']
  dateFrom: string
  dateTo: string
  open: boolean
  onOpenChange(open: boolean): void
}

interface PreviewGroup {
  runId: string
  weekKey: string | null
  from: string
  to: string
  run: any
  changes: any[]
}

export function ContextualOptimizeDialog({
  businessId,
  scope,
  dateFrom,
  dateTo,
  open,
  onOpenChange,
}: ContextualOptimizeDialogProps) {
  const { t } = useT()
  const queryClient = useQueryClient()
  const wasOpen = useRef(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [groups, setGroups] = useState<PreviewGroup[]>([])
  const [batchId, setBatchId] = useState<string | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [allowCrossWeek, setAllowCrossWeek] = useState(false)
  const [maxCrossWeekDays, setMaxCrossWeekDays] = useState(7)
  const [appliedChanges, setAppliedChanges] = useState<any[] | null>(null)

  const optimize = useCallback(async () => {
    setLoading(true)
    setGroups([])
    setExcluded(new Set())
    setAppliedChanges(null)
    try {
      await ensureAlgorithmSettings(businessId)
      const settings = await getAlgorithmSettings(businessId)
      const allow = settings?.metadata?.ALLOW_CROSS_WEEK === true
      const maximum = Math.min(
        31,
        Math.max(1, Number(settings?.metadata?.MAX_CROSS_WEEK_DAYS ?? 7)),
      )
      setAllowCrossWeek(allow)
      setMaxCrossWeekDays(maximum)
      const response = await runContextualOptimization({
        businessId,
        scope,
        dateFrom,
        dateTo,
        allowCrossWeek: allow,
        maxCrossWeekDays: maximum,
      })
      const previews = await Promise.all(response.runs.map(async (descriptor) => {
        const preview = await fetchRun(descriptor.runId)
        return { ...descriptor, ...preview }
      }))
      setBatchId(response.batchId)
      setGroups(previews)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('opt.failed'))
    } finally {
      setLoading(false)
    }
  }, [businessId, dateFrom, dateTo, scope, t])

  useEffect(() => {
    if (open && !wasOpen.current) void optimize()
    wasOpen.current = open
  }, [open, optimize])

  const allChanges = useMemo(
    () => groups.flatMap((group) => group.changes),
    [groups],
  )
  const selected = useMemo(
    () => allChanges.filter((change) => !excluded.has(change.id)),
    [allChanges, excluded],
  )

  async function apply() {
    setApplying(true)
    try {
      await applyOptimizationBatch(
        businessId,
        groups.map((group) => group.runId),
        selected.map((change) => change.id),
      )
      invalidateCalendarAppointments(queryClient, businessId)
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['waiting'] })
      void queryClient.invalidateQueries({ queryKey: ['pool-planned', businessId] })
      void queryClient.invalidateQueries({ queryKey: ['optimizations'] })
      setAppliedChanges(selected.map((change) => ({
        ...change,
        accepted: true,
      })))
      toast.success(t('opt.applied', { n: selected.length }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('opt.failed'))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('opt.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(88vh-4rem)] overflow-y-auto p-5">
          {scope === 'month' ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/35 p-3 text-sm">
              <Badge variant={allowCrossWeek ? 'default' : 'secondary'}>
                {allowCrossWeek
                  ? t('opt.crossWeekOn')
                  : t('opt.crossWeekOff')}
              </Badge>
              <span className="text-muted-foreground">
                {allowCrossWeek
                  ? t('opt.maxDisplacement', { n: maxCrossWeekDays })
                  : t('opt.weekIsolated')}
              </span>
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t('opt.building')}
            </div>
          ) : appliedChanges ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-medium">
                {t('opt.applied', { n: appliedChanges.length })}
              </div>
              <MovedMessages
                businessId={businessId}
                changes={appliedChanges}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.runId} className="rounded-xl border border-border">
                  <header className="border-b border-border bg-muted/30 px-3 py-2">
                    <p className="text-sm font-semibold">
                      {group.weekKey
                        ? t('opt.weekGroup', { date: group.weekKey })
                        : `${group.from} – ${group.to}`}
                    </p>
                    {group.run?.ai_summary ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {group.run.ai_summary}
                      </p>
                    ) : null}
                  </header>
                  <div className="divide-y divide-border">
                    {group.changes.map((change) => {
                      const checked = !excluded.has(change.id)
                      return (
                        <label
                          key={change.id}
                          className="flex min-h-11 items-start gap-3 p-3"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => setExcluded((current) => {
                              const next = new Set(current)
                              if (next.has(change.id)) next.delete(change.id)
                              else next.add(change.id)
                              return next
                            })}
                          />
                          <span className="min-w-0 text-sm">
                            <span className="block font-medium">
                              {change.patients?.full_name
                                || change.patients?.first_name
                                || t('dash.client')}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {change.old_date
                                ? `${change.old_date} ${change.old_start_time?.slice(0, 5)} → `
                                : ''}
                              {change.new_date} {change.new_start_time?.slice(0, 5)}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </section>
              ))}
              {groups.length > 0 && allChanges.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t('opt.alreadyOptimal')}
                </p>
              ) : null}
              {groups.length > 0 && allChanges.length > 0 ? (
                <Button
                  className="w-full"
                  size="lg"
                  disabled={applying || selected.length === 0 || !batchId}
                  onClick={apply}
                >
                  {applying
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Check className="mr-2 h-4 w-4" />}
                  {selected.length === 0
                    ? t('opt.applyNone')
                    : t('opt.apply', { n: selected.length })}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
