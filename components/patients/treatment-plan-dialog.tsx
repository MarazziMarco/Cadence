'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, CalendarPlus } from 'lucide-react'
import { listServices } from '@/lib/api/services'
import { createTreatmentPlan, generateSessionDates } from '@/lib/api/treatment-plans'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/use-t'
import { bcp47 } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Weekday chips in Mon..Sun order, mapped to JS getDay() numbers.
const WD = [
  { day: 1 }, { day: 2 }, { day: 3 }, { day: 4 },
  { day: 5 }, { day: 6 }, { day: 0 },
]

export function TreatmentPlanDialog({ businessId, patientId, open, onOpenChange }: {
  businessId: string; patientId: string; open: boolean; onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
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
    if (!label.trim()) { toast.error(t('plan.chooseError')); return }
    const n = parseInt(totalSessions) || 0
    if (n < 1) { toast.error(t('plan.sessionsError')); return }
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
      toast.success(t('plan.created', { count: n }))
      qc.invalidateQueries({ queryKey: ['patient-plans', patientId] })
      qc.invalidateQueries({ queryKey: ['patient-upcoming', patientId] })
      invalidateCalendarAppointments(qc, businessId)
      onOpenChange(false)
    } catch (e: any) {
      toast.error(t('plan.createError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarPlus className="h-4 w-4 text-primary" /> {t('plan.new')}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('plan.service')}</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder={t('plan.choose')} /></SelectTrigger>
                <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.duration_minutes}m</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('plan.treatmentType')}</Label>
              <Input value={treatmentType} onChange={(e) => setTreatmentType(e.target.value)} placeholder={svc?.name || t('plan.treatmentExample')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>{t('plan.sessions')}</Label><Input type="number" min="1" value={totalSessions} onChange={(e) => setTotalSessions(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>{t('plan.perWeek')}</Label>
              <Select value={sessionsPerWeek} onValueChange={setSessionsPerWeek}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['1', '2', '3', '4', '5'].map((v) => <SelectItem key={v} value={v}>{t('plan.perWeekShort', { count: v })}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('plan.minGap')}</Label><Input type="number" min="0" value={minGapHours} onChange={(e) => setMinGapHours(e.target.value)} /></div>
          </div>

          <div className="space-y-2">
            <Label>{t('plan.preferredDays')} <span className="text-muted-foreground">{t('plan.optional')}</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {WD.map((w) => (
                <button key={w.day} type="button" onClick={() => toggleDay(w.day)}
                  className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    weekdays.includes(w.day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}>
                  {new Date(2024, 0, w.day === 0 ? 7 : w.day).toLocaleDateString(dateLocale, { weekday: 'short' })}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t('plan.startDate')}</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('plan.time')}</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
          </div>

          <div className="space-y-2"><Label>{t('plan.therapistNotes')} <span className="text-muted-foreground">{t('plan.optional')}</span></Label>
            <Input value={therapist} onChange={(e) => setTherapist(e.target.value)} placeholder={t('plan.assignedTherapist')} />
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('plan.notesPlaceholder')} />
          </div>

          {preview.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('plan.preview', { count: preview.length, from: preview[0], to: preview[preview.length - 1], time: startTime })}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} {t('plan.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
