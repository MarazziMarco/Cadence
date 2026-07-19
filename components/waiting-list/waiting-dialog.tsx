'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createWaiting, updateWaiting } from '@/lib/api/waiting-list'
import { listPatientsForSelect } from '@/lib/api/appointments'
import { listServices } from '@/lib/api/services'
import { WEEKDAYS, WEEKDAY_LABELS, AVAILABILITY_PRIORITY, type Weekday } from '@/lib/types/db'
import { useT } from '@/lib/i18n/use-t'
import { bcp47 } from '@/lib/i18n'
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
  const { t, locale } = useT()
  const dloc = bcp47(locale)
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
  // Pool "to plan": stored in the waiting_list.notes JSON (no schema change).
  const [planEnabled, setPlanEnabled] = useState(false)
  const [sessionsTotal, setSessionsTotal] = useState('4')
  const [maxPerWeek, setMaxPerWeek] = useState('2')
  const [gapHours, setGapHours] = useState('48')
  // Any JSON keys we didn't surface (e.g. advance_for) are preserved on save.
  const [notesRest, setNotesRest] = useState<Record<string, unknown>>({})

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
      // notes may be plain text or a JSON envelope { pool, note, advance_for... }
      let text = entry?.notes ?? ''
      let rest: Record<string, unknown> = {}
      let pool: any = null
      try {
        const j = JSON.parse(entry?.notes ?? '')
        if (j && typeof j === 'object') {
          rest = j
          pool = j.pool ?? null
          text = typeof j.note === 'string' ? j.note : ''
        }
      } catch { /* plain-text notes */ }
      setNotesRest(rest)
      setNotes(text)
      setPlanEnabled(!!pool)
      setSessionsTotal(String(pool?.sessions_total ?? 4))
      setMaxPerWeek(String(pool?.max_per_week ?? 2))
      setGapHours(String(pool?.gap_hours ?? 48))
    }
  }, [open])

  function toggleDay(d: Weekday) { setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]) }

  // Serialize notes: a JSON envelope when a pool plan is set (preserving any
  // other keys such as advance_for), otherwise plain text (or null).
  function buildNotes(): string | null {
    const text = notes.trim()
    if (!planEnabled) {
      const rest = { ...notesRest }
      delete (rest as any).pool
      delete (rest as any).note
      if (Object.keys(rest).length === 0) return text || null
      if (text) (rest as any).note = text
      return JSON.stringify(rest)
    }
    const env: Record<string, unknown> = { ...notesRest }
    env.pool = {
      sessions_total: Math.max(1, Math.floor(Number(sessionsTotal) || 1)),
      max_per_week: Math.max(0, Math.floor(Number(maxPerWeek) || 0)),
      gap_hours: Math.max(0, Number(gapHours) || 0),
    }
    if (text) env.note = text
    else delete env.note
    return JSON.stringify(env)
  }

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
        flexible,
        notes: buildNotes(),
      }
      return editing ? updateWaiting(entry.id, values) : createWaiting(businessId, values)
    },
    onSuccess: () => { toast.success(editing ? t('waitd.updated') : t('waitd.added')); qc.invalidateQueries({ queryKey: ['waiting'] }); onOpenChange(false) },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? t('waitd.editTitle') : t('waitd.newTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t('waitd.client')}</Label><Select value={patientId} onValueChange={setPatientId}><SelectTrigger><SelectValue placeholder={t('waitd.select')} /></SelectTrigger><SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.first_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>{t('waitd.priority')}</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AVAILABILITY_PRIORITY.map((p) => <SelectItem key={p} value={p}>{t('wait.priority.' + p)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>{t('waitd.prefService')}</Label><Select value={serviceId} onValueChange={setServiceId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('waitd.anyService')}</SelectItem>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2">
            <Label>{t('waitd.prefDays')}</Label>
            <div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((d, i) => <button key={d} type="button" onClick={() => toggleDay(d)} className={cn('rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors', weekdays.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent')}>{new Date(2024, 0, 1 + i).toLocaleDateString(dloc, { weekday: 'short' })}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t('waitd.earliestDate')}</Label><Input type="date" value={earliestDate} onChange={(e) => setEarliestDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('waitd.latestDate')}</Label><Input type="date" value={latestDate} onChange={(e) => setLatestDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t('waitd.earliestTime')}</Label><Input type="time" value={earliestTime} onChange={(e) => setEarliestTime(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('waitd.latestTime')}</Label><Input type="time" value={latestTime} onChange={(e) => setLatestTime(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between"><Label>{t('waitd.flexible')}</Label><Switch checked={flexible} onCheckedChange={setFlexible} /></div>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('waitd.plan')}</Label>
                <p className="text-xs text-muted-foreground">{t('waitd.planHint')}</p>
              </div>
              <Switch checked={planEnabled} onCheckedChange={setPlanEnabled} />
            </div>
            {planEnabled ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>{t('waitd.sessionsTotal')}</Label><Input type="number" min={1} value={sessionsTotal} onChange={(e) => setSessionsTotal(e.target.value)} /></div>
                <div className="space-y-2"><Label>{t('waitd.maxPerWeek')}</Label><Input type="number" min={0} value={maxPerWeek} onChange={(e) => setMaxPerWeek(e.target.value)} /></div>
                <div className="space-y-2"><Label>{t('waitd.gapHours')}</Label><Input type="number" min={0} value={gapHours} onChange={(e) => setGapHours(e.target.value)} /></div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2"><Label>{t('waitd.notes')}</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button onClick={() => save.mutate()} disabled={!patientId || save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? t('common.save') : t('waitd.add')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
