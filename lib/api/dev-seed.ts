import { createAppointment, listPatientsForSelect } from './appointments'
import { createPatient } from './patients'
import { listServices } from './services'

// Dev helper: fill the calendar with scattered fake appointments over the next
// four weeks, so the demo account has realistic (messy) data for screenshots /
// videos. Runs client-side with the logged-in session (RLS applies).

const NAMES: [string, string][] = [
  ['Marco', 'Rossi'], ['Giulia', 'Bianchi'], ['Luca', 'Verdi'], ['Sara', 'Neri'],
  ['Elena', 'Conti'], ['Paolo', 'Ferrari'], ['Anna', 'Ricci'], ['Davide', 'Moretti'],
  ['Chiara', 'Galli'], ['Fabio', 'Costa'],
]
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
// Scattered start times (minutes from midnight) with deliberate gaps.
const STARTS = [540, 630, 690, 780, 870, 930, 990, 1020] // 09:00, 10:30, 11:30, 13:00, 14:30, 15:30, 16:30, 17:00
const DURS = [30, 45, 60]

const rand = (n: number) => Math.floor(Math.random() * n)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`

export async function seedDemoAppointments(businessId: string): Promise<number> {
  if (!businessId) throw new Error('No business')

  // Ensure we have some clients to book.
  let patients = await listPatientsForSelect(businessId)
  if (patients.length < 6) {
    for (let i = 0; i < NAMES.length; i++) {
      const [first_name, last_name] = NAMES[i]
      await createPatient(businessId, { first_name, last_name, color: COLORS[i % COLORS.length], is_vip: i % 5 === 0 })
    }
    patients = await listPatientsForSelect(businessId)
  }
  const services = await listServices(businessId)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  let created = 0

  for (let day = 0; day < 28; day++) {
    const d = new Date(today); d.setDate(d.getDate() + day)
    if (((d.getDay() + 6) % 7) > 4) continue // Mon–Fri only
    const count = 2 + rand(3) // 2–4 per day
    const chosen = [...STARTS].sort(() => Math.random() - 0.5).slice(0, count).sort((a, b) => a - b)
    for (const startMin of chosen) {
      const p = patients[rand(patients.length)]
      const svc = services.length ? services[rand(services.length)] : null
      const dur = svc?.duration_minutes ?? DURS[rand(DURS.length)]
      await createAppointment(businessId, {
        patient_id: p.id,
        service_id: svc?.id ?? null,
        appointment_date: ymd(d),
        start_time: minToTime(startMin),
        end_time: minToTime(startMin + dur),
        duration_minutes: dur,
        price: svc?.price ?? null,
        color: svc?.color ?? (p as any).color ?? '#4f46e5',
        title: svc?.name ?? null,
      })
      created++
    }
  }
  return created
}
