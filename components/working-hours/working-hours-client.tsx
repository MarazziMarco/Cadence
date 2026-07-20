'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, CalendarOff } from 'lucide-react'
import { listWorkingHours, updateWorkingHour, ensureWorkingHours, getBusinessSettings, updateBusinessSettings, listHolidays, createHoliday, deleteHoliday } from '@/lib/api/working-hours'
import { WEEKDAYS, type WorkingHour, type Weekday } from '@/lib/types/db'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { bcp47 } from '@/lib/i18n'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function WorkingHoursClient() {
  const { business } = useWorkspace()
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const businessId = business?.id ?? ''
  const qc = useQueryClient()

  const { data: rawHours, isLoading } = useQuery({
    queryKey: ['working_hours', businessId],
    queryFn: async () => ensureWorkingHours(businessId, await listWorkingHours(businessId), WEEKDAYS),
    enabled: !!businessId,
  })
  const { data: settings } = useQuery({ queryKey: ['business_settings', businessId], queryFn: () => getBusinessSettings(businessId), enabled: !!businessId })
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays', businessId], queryFn: () => listHolidays(businessId), enabled: !!businessId })

  const [hours, setHours] = useState<Record<Weekday, WorkingHour>>({} as any)
  useEffect(() => {
    if (rawHours) {
      const map = {} as Record<Weekday, WorkingHour>
      rawHours.forEach((h) => { map[h.weekday] = h })
      setHours(map)
    }
  }, [rawHours])

  const [dur, setDur] = useState(''); const [slot, setSlot] = useState(''); const [buffer, setBuffer] = useState(''); const [maxDaily, setMaxDaily] = useState('')
  const [lunchEnabled, setLunchEnabled] = useState(false); const [lunchStart, setLunchStart] = useState('13:00'); const [lunchEnd, setLunchEnd] = useState('14:00')
  useEffect(() => {
    if (settings) {
      setDur(String(settings.default_appointment_duration ?? 30)); setSlot(String(settings.slot_interval_minutes ?? 15))
      setBuffer(String(settings.default_buffer_minutes ?? 0)); setMaxDaily(settings.max_daily_appointments ? String(settings.max_daily_appointments) : '')
      setLunchEnabled(!!settings.lunch_break_enabled); setLunchStart(settings.lunch_start ?? '13:00'); setLunchEnd(settings.lunch_end ?? '14:00')
    }
  }, [settings])

  function patchDay(d: Weekday, patch: Partial<WorkingHour>) { setHours((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } })) }

  const saveHours = useMutation({
    mutationFn: async () => {
      await Promise.all(WEEKDAYS.filter((d) => hours[d]).map((d) => {
        const h = hours[d]
        return updateWorkingHour(h.id, { is_open: h.is_open, morning_start: h.morning_start || null, morning_end: h.morning_end || null, afternoon_start: h.afternoon_start || null, afternoon_end: h.afternoon_end || null })
      }))
    },
    onSuccess: () => { toast.success(t('working.hoursSaved')); qc.invalidateQueries({ queryKey: ['working_hours'] }) },
    onError: () => toast.error(t('common.saveFailed')),
  })

  const saveSettings = useMutation({
    mutationFn: () => updateBusinessSettings(businessId, {
      default_appointment_duration: parseInt(dur) || 30, slot_interval_minutes: parseInt(slot) || 15,
      default_buffer_minutes: parseInt(buffer) || 0, max_daily_appointments: maxDaily ? parseInt(maxDaily) : null,
      lunch_break_enabled: lunchEnabled, lunch_start: lunchEnabled ? lunchStart : null, lunch_end: lunchEnabled ? lunchEnd : null,
    }),
    onSuccess: () => { toast.success(t('working.settingsSaved')); qc.invalidateQueries({ queryKey: ['business_settings'] }) },
    onError: () => toast.error(t('common.saveFailed')),
  })

  const [holOpen, setHolOpen] = useState(false)
  const [holTitle, setHolTitle] = useState(''); const [holStart, setHolStart] = useState(''); const [holEnd, setHolEnd] = useState('')
  const addHoliday = useMutation({
    mutationFn: () => createHoliday(businessId, { title: holTitle.trim(), start_date: holStart, end_date: holEnd || holStart, is_closed: true, affects_scheduler: true }),
    onSuccess: () => { toast.success(t('working.holidayAdded')); setHolOpen(false); setHolTitle(''); setHolStart(''); setHolEnd(''); qc.invalidateQueries({ queryKey: ['holidays'] }) },
    onError: () => toast.error(t('common.saveFailed')),
  })
  const delHoliday = useMutation({ mutationFn: (id: string) => deleteHoliday(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['holidays'] }); toast.success(t('working.removed')) } })

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>

  return (
    <div>
      <PageHeader title={t('working.title')} description={t('working.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">{t('working.weekly')}</CardTitle>
            <Button size="sm" onClick={() => saveHours.mutate()} disabled={saveHours.isPending}>{saveHours.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('common.save')}</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {WEEKDAYS.map((d) => hours[d] && (
              <div key={d} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><Switch checked={hours[d].is_open} onCheckedChange={(v) => patchDay(d, { is_open: v })} /><span className="w-24 text-sm font-medium">{new Date(2024, 0, 1 + WEEKDAYS.indexOf(d)).toLocaleDateString(dateLocale, { weekday: 'long' })}</span></div>
                  {!hours[d].is_open && <span className="text-xs text-muted-foreground">{t('working.closed')}</span>}
                </div>
                {hours[d].is_open && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input type="time" value={hours[d].morning_start ?? ''} onChange={(e) => patchDay(d, { morning_start: e.target.value })} />
                    <Input type="time" value={hours[d].morning_end ?? ''} onChange={(e) => patchDay(d, { morning_end: e.target.value })} />
                    <Input type="time" value={hours[d].afternoon_start ?? ''} onChange={(e) => patchDay(d, { afternoon_start: e.target.value })} />
                    <Input type="time" value={hours[d].afternoon_end ?? ''} onChange={(e) => patchDay(d, { afternoon_end: e.target.value })} />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">{t('working.defaults')}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>{saveSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('common.save')}</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2"><Label>{t('working.defaultDuration')}</Label><Input type="number" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t('working.slotInterval')}</Label><Input type="number" value={slot} onChange={(e) => setSlot(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t('working.defaultBuffer')}</Label><Input type="number" value={buffer} onChange={(e) => setBuffer(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t('working.maxDaily')}</Label><Input type="number" value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)} placeholder={t('working.noLimit')} /></div>
              <div className="flex items-center justify-between pt-1"><Label>{t('working.lunch')}</Label><Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} /></div>
              {lunchEnabled && <div className="grid grid-cols-2 gap-2"><Input type="time" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} /><Input type="time" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} /></div>}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">{t('working.holidays')}</CardTitle><Button size="sm" variant="outline" onClick={() => setHolOpen(true)}><Plus className="mr-1 h-4 w-4" /> {t('common.add')}</Button></CardHeader>
            <CardContent className="space-y-2">
              {holidays.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t('working.noClosures')}</p> : holidays.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2"><CalendarOff className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium">{h.title}</p><p className="text-xs text-muted-foreground">{h.start_date}{h.end_date !== h.start_date ? ` → ${h.end_date}` : ''}</p></div></div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => delHoliday.mutate(h.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={holOpen} onOpenChange={setHolOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('working.addHoliday')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>{t('working.holidayTitle')}</Label><Input value={holTitle} onChange={(e) => setHolTitle(e.target.value)} placeholder={t('working.holidayPlaceholder')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>{t('working.start')}</Label><Input type="date" value={holStart} onChange={(e) => setHolStart(e.target.value)} /></div>
              <div className="space-y-2"><Label>{t('working.end')}</Label><Input type="date" value={holEnd} onChange={(e) => setHolEnd(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setHolOpen(false)}>{t('common.cancel')}</Button><Button onClick={() => addHoliday.mutate()} disabled={!holTitle.trim() || !holStart || addHoliday.isPending}>{addHoliday.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('common.add')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
