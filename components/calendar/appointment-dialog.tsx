'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { createAppointment, updateAppointment, deleteAppointment, listPatientsForSelect, minToTime, timeToMin, type CalendarAppointment } from '@/lib/api/appointments'
import { createPatient } from '@/lib/api/patients'
import { listServices } from '@/lib/api/services'
import { useWorkspace } from '@/lib/workspace-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function AppointmentDialog({ businessId, appt, defaultDate, defaultStart, open, onOpenChange }: { businessId: string; appt?: CalendarAppointment | null; defaultDate?: string; defaultStart?: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { business } = useWorkspace()
  const editing = !!appt
  const [patientId, setPatientId] = useState('')
  const [newClient, setNewClient] = useState('')
  const [serviceId, setServiceId] = useState<string>('none')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState(String(business?.default_appointment_duration ?? 30))

  const { data: patients = [] } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: !!businessId && open })
  const { data: services = [] } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: !!businessId && open })

  useEffect(() => {
    if (open) {
      setPatientId(appt?.patient_id ?? '')
      setNewClient('')
      setServiceId(appt?.service_id ?? 'none')
      setDate(appt?.appointment_date ?? defaultDate ?? (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })())
      setStart(appt ? appt.start_time.slice(0, 5) : (defaultStart ?? '09:00'))
      setDuration(String(appt?.duration_minutes ?? business?.default_appointment_duration ?? 30))
    }
  }, [open])

  function onServiceChange(id: string) {
    setServiceId(id)
    const svc = services.find((s: any) => s.id === id)
    if (svc) setDuration(String(svc.duration_minutes))
  }

  const save = useMutation({
    mutationFn: async () => {
      let pid = patientId
      if (!pid && newClient.trim()) { const np = await createPatient(businessId, { first_name: newClient.trim() }); pid = np.id }
      const startMin = timeToMin(start + ':00')
      const dur = parseInt(duration) || 30
      const svc = services.find((s: any) => s.id === serviceId)
      const values: any = {
        patient_id: pid,
        service_id: serviceId === 'none' ? null : serviceId,
        appointment_date: date,
        start_time: minToTime(startMin),
        end_time: minToTime(startMin + dur),
        duration_minutes: dur,
        price: svc?.price ?? 0,
        color: svc?.color ?? '#4f46e5',
        title: svc?.name ?? null,
      }
      if (editing) return updateAppointment(appt!.id, values)
      return createAppointment(businessId, values)
    },
    onSuccess: () => { toast.success(editing ? 'Appointment updated' : 'Appointment created'); qc.invalidateQueries({ queryKey: ['appointments'] }); qc.invalidateQueries({ queryKey: ['patients'] }); qc.invalidateQueries({ queryKey: ['patients-select'] }); onOpenChange(false) },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  })

  const del = useMutation({
    mutationFn: () => deleteAppointment(appt!.id),
    onSuccess: () => { toast.success('Appointment deleted'); qc.invalidateQueries({ queryKey: ['appointments'] }); onOpenChange(false) },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit appointment' : 'New appointment'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Client *</Label>
            <Select value={patientId} onValueChange={(v) => { setPatientId(v); setNewClient('') }}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent>
            </Select>
            {!editing && <Input placeholder="…or type a new client name" value={newClient} onChange={(e) => { setNewClient(e.target.value); if (e.target.value) setPatientId('') }} />}
          </div>
          <div className="space-y-2">
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={onServiceChange}>
              <SelectTrigger><SelectValue placeholder="No service" /></SelectTrigger>
              <SelectContent><SelectItem value="none">No service</SelectItem>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.emoji ? s.emoji + ' ' : ''}{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Start</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-2"><Label>Min</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {editing ? <Button variant="ghost" size="icon" className="text-destructive" onClick={() => del.mutate()}><Trash2 className="h-4 w-4" /></Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={(!patientId && !newClient.trim()) || save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save' : 'Create'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
