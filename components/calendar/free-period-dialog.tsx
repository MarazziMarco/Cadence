'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CalendarX2, Check, AlertTriangle, XCircle } from 'lucide-react'
import { runFreePeriodOptimization, fetchRun, type FreePeriodKind, type FreePeriodRun } from '@/lib/api/scheduler'
import { useT } from '@/lib/i18n/use-t'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OptimizePreview } from './optimize-preview'

// "Free this day / afternoon" preview. Runs the evacuation on the Edge Function,
// shows the exact plan (all-or-nothing) plus any blockers, and applies it.
export function FreePeriodDialog({ businessId, date, kind, open, onOpenChange, afternoonStartMinute }: {
  businessId: string
  date: string
  kind: FreePeriodKind
  open: boolean
  onOpenChange: (v: boolean) => void
  afternoonStartMinute?: number
}) {
  const { t } = useT()
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState<any>(null)
  const [changes, setChanges] = useState<any[]>([])
  const [meta, setMeta] = useState<FreePeriodRun | null>(null)

  useEffect(() => {
    let alive = true
    if (!open) { setRun(null); setChanges([]); setMeta(null); return }
    setLoading(true)
    ;(async () => {
      try {
        const res = await runFreePeriodOptimization({ businessId, date, kind, afternoonStartMinute })
        const fetched = await fetchRun(res.runId)
        if (!alive) return
        setMeta(res); setRun(fetched.run); setChanges(fetched.changes)
      } catch {
        if (alive) { toast.error(t('opt.failed')); onOpenChange(false) }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [open, businessId, date, kind, afternoonStartMinute, onOpenChange])

  const banner = meta ? (
    <div className={`rounded-xl border px-3 py-2.5 text-sm ${meta.completion === 'complete' ? 'border-success/30 bg-success/10' : meta.completion === 'partial' ? 'border-warning/30 bg-warning/10' : 'border-destructive/30 bg-destructive/10'}`}>
      <div className="flex items-center gap-2 font-medium">
        {meta.completion === 'complete' ? <Check className="h-4 w-4 text-success" /> : meta.completion === 'partial' ? <AlertTriangle className="h-4 w-4 text-warning" /> : <XCircle className="h-4 w-4 text-destructive" />}
        {t(`fp.${meta.completion}`)}
      </div>
      {meta.blockers.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted-foreground">{t('fp.blockers', { n: meta.blockers.length })}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {meta.blockers.map((b, i) => (
              <li key={i}>• {t('fp.blocker.' + b.code)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base"><CalendarX2 className="h-4 w-4 text-primary" /> {t('fp.title')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(85vh-4rem)] overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('fp.building')}</p>
            </div>
          )}
          {!loading && run && (
            <OptimizePreview businessId={businessId} run={run} changes={changes} exact banner={banner} applyLabel={t('fp.apply')} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
