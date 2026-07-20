'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createService, updateService } from '@/lib/api/services'
import type { Service } from '@/lib/types/db'
import { useT } from '@/lib/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
const EMOJIS = ['💆', '💇', '✂️', '💅', '🧖', '🦷', '🩺', '💉', '🥗', '🏋️', '🧘', '🐾', '👁️', '💬', '⭐']

export function ServiceFormDialog({ businessId, service, open, onOpenChange }: { businessId: string; service?: Service | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { t } = useT()
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
        metadata: { ...(service as any)?.metadata, category: category.trim() || t('svc.general') },
      }
      if (editing) return updateService(service!.id, values)
      return createService(businessId, values)
    },
    onSuccess: () => {
      toast.success(editing ? t('svcf.updated') : t('svcf.added'))
      qc.invalidateQueries({ queryKey: ['services'] })
      onOpenChange(false)
    },
    onError: () => toast.error(t('appt.saveFailed')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? t('svcf.editTitle') : t('svcf.newTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label>{t('svcf.name')}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('svcf.namePh')} /></div>
          <div className="space-y-2">
            <Label>{t('svcf.icon')} <span className="text-muted-foreground">{t('svcf.optional')}</span></Label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setEmoji('')} className={cn('flex h-9 w-9 items-center justify-center rounded-md border text-sm', !emoji ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent')}>—</button>
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)} className={cn('flex h-9 w-9 items-center justify-center rounded-md border text-lg', emoji === e ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent')}>{e}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2"><Label>{t('svcf.category')}</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('svcf.categoryPh')} /></div>
          <div className="space-y-2"><Label>{t('svcf.description')}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>{t('svcf.duration')}</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('svcf.price')}</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('svcf.vat')}</Label><Input type="number" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t('svcf.bufferBefore')}</Label><Input type="number" value={bufferBefore} onChange={(e) => setBufferBefore(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('svcf.bufferAfter')}</Label><Input type="number" value={bufferAfter} onChange={(e) => setBufferAfter(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>{t('svcf.color')}</Label>
            <div className="flex flex-wrap gap-1.5">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}</div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">{t('svcf.aiTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('svcf.aiHint')}</p>
            </div>
            <Switch checked={aiSchedule} onCheckedChange={setAiSchedule} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? t('common.save') : t('svcf.addService')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
