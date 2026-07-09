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
