'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createWaiting, updateWaiting } from '@/lib/api/waiting-list'
import { listPatientsForSelect } from '@/lib/api/appointments'
import { listServices } from '@/lib/api/services'
import { WEEKDAYS, WEEKDAY_LABELS, AVAILABILITY_PRIORITY, type Weekday } from '@/lib/types/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function WaitingDialog({ businessId, entry, open, onOpenChange }: { businessId: string; entry?: any; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const editing = !!entry
  const [patientId, setPatientId] = useState('')
  const [serviceId, setServiceId] = useState('none')
  const [priority, setPriority] = useState('normal')
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [earliestDate, setEarliestDate] = useState('')
  const [latestDate, setLatestDate] = useState('')
  const [earliestTime, setEarliestTime] = useState('')
  const [latestTime, setLatestTime] = useState('')
  const [flexible, setFlexible] = useState(true)
  const [notes, setNotes] = useState('')

  const { data: patients = [] } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: open })
  const { data: services = [] } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: open })

  useEffect(() => {
    if (open) {
      setPatientId(entry?.patient_id ?? '')
      setServiceId(entry?.preferred_service_id ?? 'none')
      setPriority(entry?.priority ?? 'normal')
      setWeekdays(entry?.preferred_weekdays ?? [])
      setEarliestDate(entry?.earliest_date ?? '')
      setLatestDate(entry?.latest_date ?? '')
      setEarliestTime(entry?.earliest_time?.slice(0, 5) ?? '')
      setLatestTime(entry?.latest_time?.slice(0, 5) ?? '')
      setFlexible(entry?.flexible ?? true)
      setNotes(entry?.notes ?? '')
    }
  }, [open])

  function toggleDay(d: Weekday) { setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]) }

  const save = useMutation({
    mutationFn: () => {
      const values: any = {
        patient_id: patientId,
        preferred_service_id: serviceId === 'none' ? null : serviceId,
        priority,
        preferred_weekdays: weekdays.length ? weekdays : null,
        earliest_date: earliestDate || null,
        latest_date: latestDate || null,
        earliest_time: earliestTime ? earliestTime + ':00' : null,
        latest_time: latestTime ? latestTime + ':00' : null,
        flexible, notes: notes.trim() || null,
      }
      return editing ? updateWaiting(entry.id, values) : createWaiting(businessId, values)
    },
    onSuccess: () => { toast.success(editing ? 'Updated' : 'Added to waiting list'); qc.invalidateQueries({ queryKey: ['waiting'] }); onOpenChange(false) },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? 'Edit waiting entry' : 'Add to waiting list'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Client *</Label><Select value={patientId} onValueChange={setPatientId}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AVAILABILITY_PRIORITY.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>Preferred service</Label><Select value={serviceId} onValueChange={setServiceId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Any service</SelectItem>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2">
            <Label>Preferred days</Label>
            <div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((d) => <button key={d} type="button" onClick={() => toggleDay(d)} className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', weekdays.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent')}>{WEEKDAY_LABELS[d].slice(0, 3)}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Earliest date</Label><Input type="date" value={earliestDate} onChange={(e) => setEarliestDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Latest date</Label><Input type="date" value={latestDate} onChange={(e) => setLatestDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Earliest time</Label><Input type="time" value={earliestTime} onChange={(e) => setEarliestTime(e.target.value)} /></div>
            <div className="space-y-2"><Label>Latest time</Label><Input type="time" value={latestTime} onChange={(e) => setLatestTime(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between"><Label>Flexible (AI may adjust)</Label><Switch checked={flexible} onCheckedChange={setFlexible} /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!patientId || save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save' : 'Add'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
