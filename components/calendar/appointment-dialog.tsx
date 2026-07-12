'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Trash2, Mic, MicOff } from 'lucide-react'
import { createAppointment, updateAppointment, deleteAppointment, listPatientsForSelect, minToTime, timeToMin, type CalendarAppointment } from '@/lib/api/appointments'
import { createPatient, setPatientWeekdayAvailability } from '@/lib/api/patients'
import { listServices } from '@/lib/api/services'
import { useWorkspace } from '@/lib/workspace-context'
import { parseAppointment } from '@/lib/voice/parse-appointment'
import { useSpeech, speechLang } from '@/lib/voice/use-speech'
import { WEEKDAYS, type Weekday } from '@/lib/types/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const DOW_SHORT: Record<'en' | 'it', string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  it: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
}

export function AppointmentDialog({ businessId, appt, defaultDate, defaultStart, defaultPatientId, open, onOpenChange }: { businessId: string; appt?: CalendarAppointment | null; defaultDate?: string; defaultStart?: string; defaultPatientId?: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { business } = useWorkspace()
  const editing = !!appt
  const [patientId, setPatientId] = useState('')
  const [newClient, setNewClient] = useState('')
  const [serviceId, setServiceId] = useState<string>('none')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState(String(business?.default_appointment_duration ?? 30))
  // Optional per-client availability the optimizer can use.
  const [showAvail, setShowAvail] = useState(false)
  const [availOnly, setAvailOnly] = useState<Set<Weekday>>(new Set())
  const [availNever, setAvailNever] = useState<Set<Weekday>>(new Set())

  const { data: patients = [] } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: !!businessId && open })
  const { data: services = [] } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: !!businessId && open })

  const it = business?.language === 'it'
  const { supported: micSupported, listening, start: startRec, stop: stopRec } = useSpeech(speechLang(business?.language))

  // Dictate instead of typing: transcribe, parse locally, prefill the fields.
  function applyVoice(text: string) {
    const r = parseAppointment(text, patients as any, services as any)
    if (r.patientId) { setPatientId(r.patientId); setNewClient('') }
    if (r.serviceId) setServiceId(r.serviceId)
    if (r.date) setDate(r.date)
    if (r.time) setStart(r.time)
    if (r.durationMinutes) setDuration(String(r.durationMinutes))
    if (!r.patientId && !r.date && !r.time) toast(it ? 'Non ho capito. Riprova.' : "Didn't catch that. Try again.")
  }

  function toggleMic() {
    if (listening) { stopRec(); return }
    startRec(applyVoice, () => toast.error(it ? 'Permesso microfono negato.' : 'Microphone permission denied.'))
  }

  useEffect(() => {
    if (open) {
      setPatientId(appt?.patient_id ?? defaultPatientId ?? '')
      setNewClient('')
      setServiceId(appt?.service_id ?? 'none')
      setDate(appt?.appointment_date ?? defaultDate ?? (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })())
      setStart(appt ? appt.start_time.slice(0, 5) : (defaultStart ?? '09:00'))
      setDuration(String(appt?.duration_minutes ?? business?.default_appointment_duration ?? 30))
      setShowAvail(false); setAvailOnly(new Set()); setAvailNever(new Set())
    }
  }, [open])

  // Resolve the two optional inputs to the concrete weekdays the client can come.
  // "Only on" wins; otherwise it's every day except the "never" ones. Null = no
  // constraint (client stays flexible).
  function resolveAvail(): Weekday[] | null {
    if (!showAvail) return null
    if (availOnly.size) return WEEKDAYS.filter((w) => availOnly.has(w) && !availNever.has(w))
    if (availNever.size) return WEEKDAYS.filter((w) => !availNever.has(w))
    return null
  }
  function toggle(set: Set<Weekday>, setter: (s: Set<Weekday>) => void, w: Weekday) {
    const n = new Set(set); n.has(w) ? n.delete(w) : n.add(w); setter(n)
  }

  function onServiceChange(id: string) {
    setServiceId(id)
    const svc = services.find((s: any) => s.id === id)
    if (svc) setDuration(String(svc.duration_minutes))
  }

  const save = useMutation({
    mutationFn: async () => {
      let pid = patientId
      if (!pid && newClient.trim()) { const np = await createPatient(businessId, { first_name: newClient.trim() }); pid = np.id }
      // Persist optional client availability for the optimizer to use.
      const availDays = resolveAvail()
      if (pid && availDays && availDays.length) await setPatientWeekdayAvailability(pid, availDays)
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
        {!editing && micSupported && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
            <Button type="button" size="sm" variant={listening ? 'destructive' : 'outline'} onClick={toggleMic}>
              {listening ? <><MicOff className="mr-1.5 h-3.5 w-3.5" /> {it ? 'Stop' : 'Stop'}</> : <><Mic className="mr-1.5 h-3.5 w-3.5" /> {it ? 'Detta' : 'Dictate'}</>}
            </Button>
            <span className="text-xs text-muted-foreground">
              {listening ? (it ? 'In ascolto…' : 'Listening…') : (it ? 'Detta invece di scrivere (es. “Marco domani alle 15 fisioterapia”)' : 'Dictate instead of typing (e.g. “Marco tomorrow at 3pm physiotherapy”)')}
            </span>
          </div>
        )}
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
          <div className="space-y-3">
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Start</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-2"><Label>Duration (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">{it ? 'Disponibilità cliente (opzionale)' : 'Client availability (optional)'}</Label>
                <p className="text-xs text-muted-foreground">{it ? "L'ottimizzatore la userà per spostare gli appuntamenti solo quando il cliente c'è." : 'The optimizer uses this to only place the client when they can actually come.'}</p>
              </div>
              <Switch checked={showAvail} onCheckedChange={setShowAvail} />
            </div>
            {showAvail && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium">{it ? 'Disponibile SOLO in questi giorni' : 'Available ONLY on these days'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w, i) => (
                      <button key={w} type="button" onClick={() => toggle(availOnly, setAvailOnly, w)}
                        className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', availOnly.has(w) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}>
                        {DOW_SHORT[it ? 'it' : 'en'][i]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium">{it ? 'Mai disponibile in questi giorni' : 'Never available on these days'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w, i) => (
                      <button key={w} type="button" onClick={() => toggle(availNever, setAvailNever, w)}
                        className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', availNever.has(w) ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border bg-card hover:bg-accent')}>
                        {DOW_SHORT[it ? 'it' : 'en'][i]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{it ? 'Lascia vuoto se il cliente è flessibile.' : 'Leave empty if the client is flexible.'}</p>
              </div>
            )}
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
