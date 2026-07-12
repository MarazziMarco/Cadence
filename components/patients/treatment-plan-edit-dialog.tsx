'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { updateTreatmentPlan } from '@/lib/api/treatment-plans'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function TreatmentPlanEditDialog({ plan, patientId, open, onOpenChange }: {
  plan: { id: string; treatmentType: string; therapist: string | null } | null
  patientId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [type, setType] = useState('')
  const [therapist, setTherapist] = useState('')

  useEffect(() => {
    if (open && plan) { setType(plan.treatmentType); setTherapist(plan.therapist ?? '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan?.id])

  const save = useMutation({
    mutationFn: () => updateTreatmentPlan(plan!.id, { treatmentType: type.trim(), therapist: therapist.trim() || null }),
    onSuccess: () => {
      toast.success('Plan updated')
      qc.invalidateQueries({ queryKey: ['patient-plans', patientId] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      onOpenChange(false)
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit treatment plan</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label>Treatment type</Label><Input value={type} onChange={(e) => setType(e.target.value)} /></div>
          <div className="space-y-2"><Label>Therapist / notes <span className="text-muted-foreground">(optional)</span></Label><Input value={therapist} onChange={(e) => setTherapist(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !type.trim()}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
