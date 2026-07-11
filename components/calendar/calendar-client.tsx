'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Info } from 'lucide-react'
import { listAppointments, updateAppointment, minToTime, timeToMin, fmtTime, type CalendarAppointment } from '@/lib/api/appointments'
import { useWorkspace } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { AppointmentDialog } from './appointment-dialog'
import { OptimizeDialog } from './optimize-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const START_HOUR = 7, END_HOUR = 21, HOUR_H = 56
const SLOT = 15

function startOfWeek(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [view, setView] = useState<'week' | 'day'>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarAppointment | null>(null)
  const [createCtx, setCreateCtx] = useState<{ date: string; start: string } | null>(null)
  const [dragGrab, setDragGrab] = useState(0)
  const [dragPreview, setDragPreview] = useState<{ date: string; startMin: number } | null>(null)

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
    mutationFn: ({ id, date, startMin, dur }: any) => updateAppointment(id, { appointment_date: date, start_time: minToTime(startMin), end_time: minToTime(startMin + dur), duration_minutes: dur }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
    onError: (e: any) => toast.error(e.message),
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
    moveMut.mutate({ id, date, startMin, dur: a.duration_minutes })
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const label = view === 'day'
    ? days[0].toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  const todayStr = ymd(new Date())

  return (
    <div>
      <PageHeader title="Calendar"
        info={
          <Popover>
            <PopoverTrigger asChild>
              <button aria-label="Shortcuts & tips" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Info className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <p className="mb-2 text-sm font-semibold">Shortcuts & tips</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><kbd className="rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground">n</kbd> New appointment</li>
                <li><kbd className="rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground">w</kbd> / <kbd className="rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground">d</kbd> Week / day view</li>
                <li><kbd className="rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground">←</kbd> <kbd className="rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground">→</kbd> Previous / next</li>
                <li><kbd className="rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground">t</kbd> Jump to today</li>
              </ul>
              <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">Drag an appointment to move it, or click an empty slot to book.</p>
            </PopoverContent>
          </Popover>
        }
        actions={<Button onClick={() => openNew()}><Plus className="mr-2 h-4 w-4" /> New</Button>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor((a) => addDays(a, view === 'day' ? -1 : -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor((a) => addDays(a, view === 'day' ? 1 : 7))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-2 text-sm font-semibold">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {businessId && <OptimizeDialog businessId={businessId} dateFrom={rangeStart} dateTo={rangeEnd} />}
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(['day', 'week'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{v}</button>
            ))}
          </div>
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
                <div className="text-xs text-muted-foreground">{DOW[(d.getDay() + 6) % 7]}</div>
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
              <div key={dateStr} className="relative flex-1 border-l border-border" style={{ height: (END_HOUR - START_HOUR) * HOUR_H }}
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
                  const height = Math.max(40, a.duration_minutes / 60 * HOUR_H - 2)
                  const color = a.color || a.services?.color || a.patients?.color || '#4f46e5'
                  const name = a.patients?.full_name || a.patients?.first_name || 'Client'
                  return (
                    <div key={a.id} draggable
                      onDragStart={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const g = e.clientY - r.top; setDragGrab(g); e.dataTransfer.setData('text/appt', a.id); e.dataTransfer.setData('text/grab', String(g)) }}
                      onDragEnd={() => setDragPreview(null)}
                      onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                      className="absolute left-1 right-1 cursor-grab overflow-hidden rounded-md border-l-2 px-2 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                      style={{ top, height, backgroundColor: color + '1f', borderColor: color }}>
                      <p className="truncate text-[13px] font-semibold leading-tight sm:text-xs" style={{ color }}>{name}</p>
                      <p className="truncate text-[11px] leading-tight text-muted-foreground">{fmtTime(a.start_time)} · {a.title || a.services?.name || `${a.duration_minutes}m`}</p>
                    </div>
                  )
                })}
                {dragPreview && dragPreview.date === dateStr && (
                  <div className="pointer-events-none absolute inset-x-0 z-30" style={{ top: (dragPreview.startMin - START_HOUR * 60) / 60 * HOUR_H }}>
                    <div className="border-t-2 border-dashed border-primary" />
                    <span className="absolute -top-2.5 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow">{fmtTime(minToTime(dragPreview.startMin))}</span>
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
