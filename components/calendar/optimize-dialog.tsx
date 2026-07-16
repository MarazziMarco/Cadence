'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Wand2, Loader2, Sparkles } from 'lucide-react'
import { runOptimization, fetchRun, ensureAlgorithmSettings } from '@/lib/api/scheduler'
import { useT } from '@/lib/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { OptimizePreview } from './optimize-preview'

// Calendar-side entry point for the intelligent optimizer. It reuses the exact
// Scheduler flow (Edge Function invoke + preview + single batch apply) via
// lib/api/scheduler and the shared OptimizePreview component.
export function OptimizeDialog({
  businessId,
  dateFrom,
  dateTo,
  open: controlledOpen,
  onOpenChange,
}: {
  businessId: string
  dateFrom: string
  dateTo: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useT()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState<any>(null)
  const [changes, setChanges] = useState<any[]>([])
  const open = controlledOpen ?? uncontrolledOpen

  async function optimize() {
    setLoading(true); setRun(null); setChanges([])
    try {
      await ensureAlgorithmSettings(businessId)
      const runId = await runOptimization(businessId, dateFrom, dateTo)
      const res = await fetchRun(runId)
      setRun(res.run); setChanges(res.changes)
    } catch (e: any) {
      toast.error(e.message || t('opt.failed'))
    } finally { setLoading(false) }
  }

  function handleOpenChange(v: boolean) {
    if (controlledOpen === undefined) setUncontrolledOpen(v)
    onOpenChange?.(v)
    if (v) { setRun(null); setChanges([]); optimize() }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Wand2 className="h-4 w-4" /> {t('sched.optimize')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> {t('opt.title')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[calc(85vh-4rem)] overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('opt.building')}</p>
            </div>
          )}
          {!loading && run && (
            <OptimizePreview businessId={businessId} run={run} changes={changes} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
