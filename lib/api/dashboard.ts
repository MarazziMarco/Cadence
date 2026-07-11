import { createClient } from '@/lib/supabase/client'
import { timeToMin } from '@/lib/api/appointments'
import { WEEKDAYS } from '@/lib/types/db'

const sb = () => createClient()
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const APPT_SELECT = 'id, appointment_date, start_time, end_time, duration_minutes, status, color, title, price, patients:patient_id ( first_name, last_name, full_name, color ), services:service_id ( name )'

export async function getDashboard(businessId: string) {
  const now = new Date()
  const today = ymd(now)
  const in7 = ymd(new Date(now.getTime() + 7 * 86400000))
  const client = sb()

  const [todaysR, upcomingR, recentR, waitingR, whR] = await Promise.all([
    client.from('appointments').select(APPT_SELECT).eq('business_id', businessId).is('deleted_at', null).eq('appointment_date', today).order('start_time'),
    client.from('appointments').select(APPT_SELECT).eq('business_id', businessId).is('deleted_at', null).gt('appointment_date', today).lte('appointment_date', in7).order('appointment_date').order('start_time').limit(6),
    client.from('appointments').select(APPT_SELECT).eq('business_id', businessId).is('deleted_at', null).order('created_at', { ascending: false }).limit(5),
    client.from('waiting_list').select('id', { count: 'exact', head: true }).eq('business_id', businessId).is('deleted_at', null).eq('active', true),
    client.from('working_hours').select('*').eq('business_id', businessId).eq('weekday', WEEKDAYS[(now.getDay() + 6) % 7]),
  ])

  const todays = todaysR.data ?? []
  const upcoming = upcomingR.data ?? []
  const recent = recentR.data ?? []
  const waitingCount = waitingR.count ?? 0

  const wh = (whR.data ?? [])[0]
  let openMin = 0
  if (wh?.is_open) {
    if (wh.morning_start && wh.morning_end) openMin += timeToMin(wh.morning_end) - timeToMin(wh.morning_start)
    if (wh.afternoon_start && wh.afternoon_end) openMin += timeToMin(wh.afternoon_end) - timeToMin(wh.afternoon_start)
  }
  const bookedMin = todays.reduce((s: number, a: any) => s + (a.duration_minutes || 0), 0)
  const occupancy = openMin > 0 ? Math.round((bookedMin / openMin) * 100) : 0
  const idleMin = Math.max(0, openMin - bookedMin)
  const revenue7 = [...todays, ...upcoming].reduce((s: number, a: any) => s + (Number(a.price) || 0), 0)

  return { todays, upcoming, recent, waitingCount, occupancy, idleMin, revenue7, todayCount: todays.length }
}

// ---- Schedule health: recoverable idle (same notion as the optimizer) --------
// Recoverable idle = free time BETWEEN appointments inside the open windows, net
// of the lunch/closure gap, not counting time before the first or after the last
// appointment. Read-only; mirrors the Edge Function's dayIdle. No new EF call.

const MIN_IDLE_GAP = 5

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  x.setHours(0, 0, 0, 0)
  return x
}
function openWindows(wh: any): { start: number; end: number }[] {
  if (!wh || !wh.is_open) return []
  const w: { start: number; end: number }[] = []
  if (wh.morning_start && wh.morning_end) w.push({ start: timeToMin(wh.morning_start), end: timeToMin(wh.morning_end) })
  if (wh.afternoon_start && wh.afternoon_end) w.push({ start: timeToMin(wh.afternoon_start), end: timeToMin(wh.afternoon_end) })
  return w
}
function inAnyWindow(start: number, end: number, wins: { start: number; end: number }[]): boolean {
  return wins.some((w) => start >= w.start && end <= w.end)
}
function openOverlap(a: number, b: number, wins: { start: number; end: number }[]): number {
  let sum = 0
  for (const w of wins) { const lo = Math.max(a, w.start), hi = Math.min(b, w.end); if (hi > lo) sum += hi - lo }
  return sum
}
function dayIdle(list: any[], wins: { start: number; end: number }[]): number {
  if (wins.length === 0) return 0
  const inDay = list
    .filter((a) => inAnyWindow(timeToMin(a.start_time), timeToMin(a.end_time), wins))
    .sort((x, y) => timeToMin(x.start_time) - timeToMin(y.start_time))
  let idle = 0
  for (let i = 1; i < inDay.length; i++) {
    const from = timeToMin(inDay[i - 1].end_time)
    const to = timeToMin(inDay[i].start_time)
    if (to <= from) continue
    const net = openOverlap(from, to, wins)
    if (net >= MIN_IDLE_GAP) idle += net
  }
  return idle
}

export async function getScheduleHealth(businessId: string): Promise<{ idleToday: number; idleWeek: number; weekFrom: string; weekTo: string }> {
  const client = sb()
  const now = new Date()
  const monday = startOfWeek(now)
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
  const from = ymd(monday), to = ymd(sunday), today = ymd(now)

  const [apptsR, whR] = await Promise.all([
    client.from('appointments').select('id, appointment_date, start_time, end_time, status')
      .eq('business_id', businessId).is('deleted_at', null).neq('status', 'cancelled')
      .gte('appointment_date', from).lte('appointment_date', to).order('start_time'),
    client.from('working_hours').select('*').eq('business_id', businessId),
  ])
  const appts = apptsR.data ?? []
  const whByDay = new Map<string, any>()
  for (const w of whR.data ?? []) whByDay.set((w as any).weekday, w)

  const byDate = new Map<string, any[]>()
  for (const a of appts as any[]) { const arr = byDate.get(a.appointment_date) ?? []; arr.push(a); byDate.set(a.appointment_date, arr) }

  let idleWeek = 0, idleToday = 0
  for (const [date, list] of byDate) {
    const wd = WEEKDAYS[(new Date(date + 'T00:00:00').getDay() + 6) % 7]
    const idle = dayIdle(list, openWindows(whByDay.get(wd)))
    idleWeek += idle
    if (date === today) idleToday = idle
  }
  return { idleToday, idleWeek, weekFrom: from, weekTo: to }
}
