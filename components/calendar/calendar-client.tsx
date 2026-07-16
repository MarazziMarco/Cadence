'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { listAppointments, updateAppointment, minToTime, timeToMin, fmtTime, type CalendarAppointment } from '@/lib/api/appointments'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { bcp47 } from '@/lib/i18n'
import {
  confirmCalendarMutationInteractively,
  isCalendarWarningConfirmation,
} from '@/lib/api/calendar'
import { AppointmentDialog } from './appointment-dialog'
import { OptimizeDialog } from './optimize-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const START_HOUR = 7, END_HOUR = 21, HOUR_H = 64
const SLOT = 15

function startOfWeek(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarClient() {
  const { business } = useWorkspace()
  const { t, locale } = useT()
  const dloc = bcp47(locale)
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [view, setView] = useState<'week' | 'day'>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarAppointment | null>(null)
  const [createCtx, setCreateCtx] = useState<{ date: string; start: string } | null>(null)
  const [dragGrab, setDragGrab] = useState(0)
  const [dragPreview, setDragPreview] = useState<{ date: string; startMin: number } | null>(null)
  // Touch drag (long-press to grab), since HTML5 DnD doesn't work on touch.
  const [touchDragId, setTouchDragId] = useState<string | null>(null)
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const suppressClick = useRef(false)

  const days = useMemo(() => {
    if (view === 'day') return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())]
    const s = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  }, [view, anchor])

  const rangeStart = ymd(days[0]), rangeEnd = ymd(days[days.length - 1])

  const { data: appts = [] } = useQuery({
    queryKey: ['appointments', businessId, rangeStart, rangeEnd],
    queryFn: () => listAppointments(businessId, rangeStart, rangeEnd),
    enabled: !!businessId,
  })

  const moveMut = useMutation({
    mutationFn: ({ appointment, date, startMin, dur }: { appointment: CalendarAppointment; date: string; startMin: number; dur: number }) => updateAppointment(
      businessId,
      appointment.id,
      appointment.version,
      {
        appointment_date: date,
        start_time: minToTime(startMin),
        end_time: minToTime(startMin + dur),
        duration_minutes: dur,
      },
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
    onError: async (error: unknown) => {
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(error instanceof Error ? error.message : 'Calendar update failed')
        return
      }
      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (confirmed) qc.invalidateQueries({ queryKey: ['appointments'] })
      } catch (retryError) {
        toast.error(retryError instanceof Error ? retryError.message : 'Calendar update failed')
      }
    },
  })

  const byDay = useMemo(() => {
    const map: Record<string, CalendarAppointment[]> = {}
    appts.forEach((a) => { (map[a.appointment_date] = map[a.appointment_date] || []).push(a) })
    return map
  }, [appts])

  function openNew(date?: string, start?: string) { setEditing(null); setCreateCtx({ date: date ?? ymd(days[0]), start: start ?? '09:00' }); setDialogOpen(true) }
  function openEdit(a: CalendarAppointment) { setEditing(a); setCreateCtx(null); setDialogOpen(true) }

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || dialogOpen) return
      if (e.key === 'n') { e.preventDefault(); openNew() }
      else if (e.key === 'w') setView('week')
      else if (e.key === 'd') setView('day')
      else if (e.key === 'ArrowLeft') setAnchor((a) => addDays(a, view === 'day' ? -1 : -7))
      else if (e.key === 'ArrowRight') setAnchor((a) => addDays(a, view === 'day' ? 1 : 7))
      else if (e.key === 't') setAnchor(new Date())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, dialogOpen, days])

  function colDrop(e: React.DragEvent, date: string) {
    e.preventDefault()
    setDragPreview(null)
    const id = e.dataTransfer.getData('text/appt')
    const grab = parseInt(e.dataTransfer.getData('text/grab') || '0')
    const a = appts.find((x) => x.id === id)
    if (!a) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top - grab
    let startMin = START_HOUR * 60 + Math.round((y / HOUR_H * 60) / SLOT) * SLOT
    startMin = Math.max(START_HOUR * 60, Math.min(startMin, END_HOUR * 60 - a.duration_minutes))
    if (date === a.appointment_date && startMin === timeToMin(a.start_time)) return
    moveMut.mutate({ appointment: a, date, startMin, dur: a.duration_minutes })
  }

  // ---- touch drag (long-press) ------------------------------------------
  function previewFromPoint(clientX: number, clientY: number) {
    const col = ((document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest('[data-date]')) as HTMLElement | null
    if (!col) return
    const date = col.getAttribute('data-date')!
    const rect = col.getBoundingClientRect()
    const y = clientY - rect.top - dragGrab
    let sm = START_HOUR * 60 + Math.round((y / HOUR_H * 60) / SLOT) * SLOT
    sm = Math.max(START_HOUR * 60, Math.min(sm, END_HOUR * 60 - SLOT))
    setDragPreview({ date, startMin: sm })
  }
  function onApptTouchStart(e: React.TouchEvent, a: CalendarAppointment) {
    const t = e.touches[0]
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const grabY = t.clientY - r.top
    touchStart.current = { x: t.clientX, y: t.clientY }
    if (lpTimer.current) clearTimeout(lpTimer.current)
    lpTimer.current = setTimeout(() => {
      setDragGrab(grabY)
      setTouchDragId(a.id)
      setDragPreview({ date: a.appointment_date, startMin: timeToMin(a.start_time) })
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20)
    }, 300)
  }
  function onApptTouchMove(e: React.TouchEvent, a: CalendarAppointment) {
    const t = e.touches[0]
    if (touchDragId === a.id) {
      previewFromPoint(t.clientX, t.clientY)
    } else {
      const dx = Math.abs(t.clientX - touchStart.current.x), dy = Math.abs(t.clientY - touchStart.current.y)
      if ((dx > 8 || dy > 8) && lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
    }
  }
  function onApptTouchEnd(a: CalendarAppointment) {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
    if (touchDragId === a.id && dragPreview) {
      const { date, startMin } = dragPreview
      if (!(date === a.appointment_date && startMin === timeToMin(a.start_time))) {
        moveMut.mutate({ appointment: a, date, startMin, dur: a.duration_minutes })
      }
      suppressClick.current = true
      setTimeout(() => { suppressClick.current = false }, 450)
    }
    setTouchDragId(null)
    setDragPreview(null)
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const label = view === 'day'
    ? days[0].toLocaleDateString(dloc, { weekday: 'long', month: 'long', day: 'numeric' })
    : `${days[0].toLocaleDateString(dloc, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(dloc, { month: 'short', day: 'numeric' })}`
  const todayStr = ymd(new Date())

  return (
    <div>
      {/* Centered primary actions (page owns the Calendar / Waiting-list tabs) */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <Button size="lg" onClick={() => openNew()}><Plus className="mr-2 h-4 w-4" /> {t('cal.new')}</Button>
        {businessId && <OptimizeDialog businessId={businessId} dateFrom={rangeStart} dateTo={rangeEnd} />}
      </div>

      {/* Date navigation + view toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setAnchor((a) => addDays(a, view === 'day' ? -1 : -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>{t('cal.today')}</Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setAnchor((a) => addDays(a, view === 'day' ? 1 : 7))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-1 text-sm font-semibold">{label}</span>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(['day', 'week'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('cal.view.' + v)}</button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Mobile: horizontal scroll with wide day columns so cards stay
            readable. Desktop (sm+): min-w collapses, columns fit side-by-side. */}
        <div className="overflow-x-auto">
        <div className="min-w-[880px] sm:min-w-0">
        <div className="flex border-b border-border bg-muted/30">
          <div className="w-14 shrink-0" />
          {days.map((d) => {
            const isToday = ymd(d) === todayStr
            return (
              <div key={ymd(d)} className="flex-1 border-l border-border py-2 text-center">
                <div className="text-xs text-muted-foreground">{d.toLocaleDateString(dloc, { weekday: 'short' })}</div>
                <div className={cn('mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold', isToday && 'bg-primary text-primary-foreground')}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>

        <div className="flex sm:max-h-[calc(100vh-16rem)] sm:overflow-y-auto">
          <div className="w-14 shrink-0">
            {hours.map((h) => <div key={h} className="relative" style={{ height: HOUR_H }}><span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</span></div>)}
          </div>
          {days.map((d) => {
            const dateStr = ymd(d)
            return (
              <div key={dateStr} data-date={dateStr} className="relative flex-1 border-l border-border" style={{ height: (END_HOUR - START_HOUR) * HOUR_H }}
                onDragOver={(e) => {
                  e.preventDefault()
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const y = e.clientY - rect.top - dragGrab
                  let sm = START_HOUR * 60 + Math.round((y / HOUR_H * 60) / SLOT) * SLOT
                  sm = Math.max(START_HOUR * 60, Math.min(sm, END_HOUR * 60 - SLOT))
                  if (!dragPreview || dragPreview.date !== dateStr || dragPreview.startMin !== sm) setDragPreview({ date: dateStr, startMin: sm })
                }}
                onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragPreview((p) => (p?.date === dateStr ? null : p)) }}
                onDrop={(e) => colDrop(e, dateStr)}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const y = e.clientY - rect.top
                  let startMin = START_HOUR * 60 + Math.floor((y / HOUR_H * 60) / SLOT) * SLOT
                  openNew(dateStr, fmtTime(minToTime(startMin)))
                }}>
                {hours.map((h) => <div key={h} className="border-b border-border/60" style={{ height: HOUR_H }} />)}
                {(byDay[dateStr] || []).map((a) => {
                  const top = (timeToMin(a.start_time) - START_HOUR * 60) / 60 * HOUR_H
                  const height = Math.max(30, a.duration_minutes / 60 * HOUR_H - 3)
                  const color = a.color || a.services?.color || a.patients?.color || '#4f46e5'
                  const name = a.patients?.full_name || a.patients?.first_name || t('dash.client')
                  const grabbed = touchDragId === a.id
                  return (
                    <div key={a.id} draggable
                      onDragStart={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const g = e.clientY - r.top; setDragGrab(g); e.dataTransfer.setData('text/appt', a.id); e.dataTransfer.setData('text/grab', String(g)) }}
                      onDragEnd={() => setDragPreview(null)}
                      onTouchStart={(e) => onApptTouchStart(e, a)}
                      onTouchMove={(e) => onApptTouchMove(e, a)}
                      onTouchEnd={() => onApptTouchEnd(a)}
                      onClick={(e) => { e.stopPropagation(); if (suppressClick.current) return; openEdit(a) }}
                      className={cn('absolute left-1 right-1 cursor-grab select-none overflow-hidden rounded-md border-l-2 px-2 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing', grabbed && 'z-40 scale-[1.03] opacity-90 shadow-lg ring-2 ring-primary')}
                      style={{ top, height, backgroundColor: color + '1f', borderColor: color, touchAction: 'none' }}>
                      <p className="truncate text-[13px] font-semibold leading-tight sm:text-xs" style={{ color }}>{name}</p>
                      <p className="truncate text-[11px] leading-tight text-muted-foreground">{fmtTime(a.start_time)} · {a.title || a.services?.name || `${a.duration_minutes}m`}</p>
                    </div>
                  )
                })}
                {dragPreview && dragPreview.date === dateStr && (
                  <div className="pointer-events-none absolute inset-x-0 z-40" style={{ top: (dragPreview.startMin - START_HOUR * 60) / 60 * HOUR_H }}>
                    <div className="border-t-2 border-dashed border-primary" />
                    {/* Time badge to the LEFT of the column so it never covers the card. */}
                    <span className="absolute right-full top-1/2 mr-1 -translate-y-1/2 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-md">{fmtTime(minToTime(dragPreview.startMin))}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </div>
        </div>
      </div>

      {businessId && <AppointmentDialog businessId={businessId} appt={editing} defaultDate={createCtx?.date} defaultStart={createCtx?.start} open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  )
}
