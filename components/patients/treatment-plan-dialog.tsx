'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, CalendarPlus } from 'lucide-react'
import { listServices } from '@/lib/api/services'
import { createTreatmentPlan, generateSessionDates } from '@/lib/api/treatment-plans'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Weekday chips in Mon..Sun order, mapped to JS getDay() numbers.
const WD = [
  { label: 'Mon', day: 1 }, { label: 'Tue', day: 2 }, { label: 'Wed', day: 3 },
  { label: 'Thu', day: 4 }, { label: 'Fri', day: 5 }, { label: 'Sat', day: 6 }, { label: 'Sun', day: 0 },
]

export function TreatmentPlanDialog({ businessId, patientId, open, onOpenChange }: {
  businessId: string; patientId: string; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const { data: services = [] } = useQuery({ queryKey: ['services', businessId], queryFn: () => listServices(businessId), enabled: !!businessId && open })

  const [serviceId, setServiceId] = useState<string>('')
  const [treatmentType, setTreatmentType] = useState('')
  const [totalSessions, setTotalSessions] = useState('8')
  const [sessionsPerWeek, setSessionsPerWeek] = useState('2')
  const [minGapHours, setMinGapHours] = useState('48')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('09:00')
  const [therapist, setTherapist] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const svc = services.find((s) => s.id === serviceId)
  const duration = svc?.duration_minutes ?? 30
  const label = treatmentType || svc?.name || ''

  function toggleDay(day: number) {
    setWeekdays((w) => (w.includes(day) ? w.filter((d) => d !== day) : [...w, day]))
  }

  // Live preview of the generated dates so the user sees the cadence.
  const preview = useMemo(() => {
    const n = parseInt(totalSessions) || 0
    if (!n) return [] as string[]
    return generateSessionDates({
      startDate,
      totalSessions: Math.min(n, 60),
      sessionsPerWeek: parseInt(sessionsPerWeek) || 1,
      minGapHours: parseInt(minGapHours) || 0,
      preferredWeekdays: weekdays,
    })
  }, [totalSessions, startDate, sessionsPerWeek, minGapHours, weekdays])

  async function submit() {
    if (!label.trim()) { toast.error('Scegli un servizio o un tipo di trattamento'); return }
    const n = parseInt(totalSessions) || 0
    if (n < 1) { toast.error('Numero di sedute non valido'); return }
    setSaving(true)
    try {
      await createTreatmentPlan(businessId, {
        patientId,
        serviceId: serviceId || null,
        durationMinutes: duration,
        price: svc?.price ?? null,
        treatmentType: label.trim(),
        totalSessions: n,
        sessionsPerWeek: parseInt(sessionsPerWeek) || 1,
        minGapHours: parseInt(minGapHours) || 0,
        preferredWeekdays: weekdays,
        startDate,
        startTime,
        therapist: therapist || null,
        notes: notes || null,
      })
      toast.success(`Piano creato · ${n} sedute`)
      qc.invalidateQueries({ queryKey: ['patient-plans', patientId] })
      qc.invalidateQueries({ queryKey: ['patient-upcoming', patientId] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || 'Errore nella creazione del piano')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarPlus className="h-4 w-4 text-primary" /> Nuovo piano di trattamento</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Servizio</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder="Scegli…" /></SelectTrigger>
                <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo trattamento</Label>
              <Input value={treatmentType} onChange={(e) => setTreatmentType(e.target.value)} placeholder={svc?.name || 'es. Riabilitazione'} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Sedute</Label><Input type="number" min="1" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>A settimana</Label>
              <Select value={sessionsPerWeek} onValueChange={setSessionsPerWeek}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['1', '2', '3', '4', '5'].map((v) => <SelectItem key={v} value={v}>{v}/sett</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Gap min (h)</Label><Input type="number" min="0" value={minGapHours} onChange={(e) => setMinGapHours(e.target.value)} /></div>
          </div>

          <div className="space-y-2">
            <Label>Giorni preferiti <span className="text-muted-foreground">(opzionale)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {WD.map((w) => (
                <button key={w.day} type="button" onClick={() => toggleDay(w.day)}
                  className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    weekdays.includes(w.day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Inizio</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Ora</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
          </div>

          <div className="space-y-2"><Label>Terapista / note <span className="text-muted-foreground">(opzionale)</span></Label>
            <Input value={therapist} onChange={(e) => setTherapist(e.target.value)} placeholder="Terapista assegnato" />
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Note sul piano…" />
          </div>

          {preview.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{preview.length} sedute</span> · dal {preview[0]} al {preview[preview.length - 1]} · {startTime}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Crea piano</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
