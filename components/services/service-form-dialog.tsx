'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createService, updateService } from '@/lib/api/services'
import type { Service } from '@/lib/types/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

export function ServiceFormDialog({ businessId, service, open, onOpenChange }: { businessId: string; service?: Service | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const editing = !!service
  const [name, setName] = useState(service?.name ?? '')
  const [category, setCategory] = useState<string>(((service as any)?.metadata?.category as string) ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [emoji, setEmoji] = useState(service?.emoji ?? '')
  const [duration, setDuration] = useState(String(service?.duration_minutes ?? 30))
  const [price, setPrice] = useState(String(service?.price ?? 0))
  const [vat, setVat] = useState(String(service?.vat_percentage ?? 22))
  const [bufferBefore, setBufferBefore] = useState(String(service?.buffer_before_minutes ?? 0))
  const [bufferAfter, setBufferAfter] = useState(String(service?.buffer_after_minutes ?? 0))
  const [color, setColor] = useState(service?.color ?? COLORS[0])
  const [aiSchedule, setAiSchedule] = useState(service?.allow_ai_scheduling ?? true)

  const mutation = useMutation({
    mutationFn: async () => {
      const values: any = {
        name: name.trim(),
        description: description.trim() || null,
        emoji: emoji.trim() || null,
        duration_minutes: parseInt(duration) || 30,
        price: parseFloat(price) || 0,
        vat_percentage: parseFloat(vat) || 0,
        buffer_before_minutes: parseInt(bufferBefore) || 0,
        buffer_after_minutes: parseInt(bufferAfter) || 0,
        color,
        allow_ai_scheduling: aiSchedule,
        metadata: { ...(service as any)?.metadata, category: category.trim() || 'General' },
      }
      if (editing) return updateService(service!.id, values)
      return createService(businessId, values)
    },
    onSuccess: () => {
      toast.success(editing ? 'Service updated' : 'Service added')
      qc.invalidateQueries({ queryKey: ['services'] })
      onOpenChange(false)
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? 'Edit service' : 'New service'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-[64px_1fr] gap-3">
            <div className="space-y-2"><Label>Icon</Label><Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="💜" className="text-center text-lg" /></div>
            <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deep tissue massage" /></div>
          </div>
          <div className="space-y-2"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Massage" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Duration (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
            <div className="space-y-2"><Label>Price</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div className="space-y-2"><Label>VAT %</Label><Input type="number" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Buffer before (min)</Label><Input type="number" value={bufferBefore} onChange={(e) => setBufferBefore(e.target.value)} /></div>
            <div className="space-y-2"><Label>Buffer after (min)</Label><Input type="number" value={bufferAfter} onChange={(e) => setBufferAfter(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-1.5">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}</div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={aiSchedule} onCheckedChange={setAiSchedule} /><Label>AI scheduling</Label></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save' : 'Add service'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
