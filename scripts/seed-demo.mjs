// Seed (and reset) the shared DEMO account with realistic English fake data.
//
//   node scripts/seed-demo.mjs
//
// Uses the Supabase service-role key (server-only, from .env.local) to:
//   1. ensure the demo auth user exists (email-confirmed)
//   2. wipe any existing demo business data  <- doubles as the "reset"
//   3. recreate business + working hours + services + patients + a messy,
//      scattered 4-week calendar + a "move me up" waiting-list entry
//
// Anyone can log in with the printed credentials and try every feature; the
// same wipe+reseed runs on each demo login so the next visitor starts clean.
// The exported resetDemo() is reused by the /api/demo/reset route.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// --- env -------------------------------------------------------------------
function loadEnv() {
  const env = {}
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
  } catch { /* serverless: no file, use process.env below */ }
  // process.env wins (Vercel / deployed), file fills the gaps (local CLI).
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (process.env[k]) env[k] = process.env[k]
  }
  return env
}

export const DEMO_EMAIL = 'test@cadence.com'
export const DEMO_PASSWORD = 'Cadence!'

const NAMES = [
  ['Emma', 'Johnson'], ['Liam', 'Smith'], ['Olivia', 'Brown'], ['Noah', 'Davis'],
  ['Ava', 'Miller'], ['James', 'Wilson'], ['Sophia', 'Moore'], ['Lucas', 'Taylor'],
  ['Mia', 'Anderson'], ['Henry', 'Thomas'], ['Isabella', 'Martin'], ['Jack', 'Lee'],
]
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
const SERVICES = [
  { name: 'Consultation', emoji: '🩺', duration_minutes: 30, price: 60, color: '#4f46e5' },
  { name: 'Follow-up', emoji: '🔁', duration_minutes: 20, price: 40, color: '#0ea5e9' },
  { name: 'Full Session', emoji: '🧠', duration_minutes: 60, price: 120, color: '#10b981' },
  { name: 'Quick Check', emoji: '⚡', duration_minutes: 15, price: 25, color: '#f59e0b' },
]
const STARTS = [540, 630, 690, 780, 870, 930, 990, 1020] // scattered, with gaps
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// Real-ish Milan addresses (approx coords) so the day map + route optimization
// have geographic data to work with. One per demo patient.
const STUDIO = { address: 'Via Dogana 3', city: 'Milano', postal: '20123', lat: 45.4640, lng: 9.1900 }
const ADDRESSES = [
  { address: 'Via Dante 7', city: 'Milano', postal: '20121', lat: 45.4655, lng: 9.1859 },
  { address: 'Corso Buenos Aires 33', city: 'Milano', postal: '20124', lat: 45.4790, lng: 9.2100 },
  { address: 'Via Torino 61', city: 'Milano', postal: '20123', lat: 45.4610, lng: 9.1840 },
  { address: 'Viale Monza 12', city: 'Milano', postal: '20125', lat: 45.4990, lng: 9.2160 },
  { address: 'Via Padova 40', city: 'Milano', postal: '20127', lat: 45.4960, lng: 9.2270 },
  { address: 'Corso Vercelli 22', city: 'Milano', postal: '20144', lat: 45.4680, lng: 9.1560 },
  { address: 'Via Washington 50', city: 'Milano', postal: '20146', lat: 45.4620, lng: 9.1500 },
  { address: 'Viale Certosa 100', city: 'Milano', postal: '20156', lat: 45.5010, lng: 9.1450 },
  { address: 'Via Ripamonti 88', city: 'Milano', postal: '20141', lat: 45.4370, lng: 9.2000 },
  { address: 'Corso Lodi 55', city: 'Milano', postal: '20139', lat: 45.4460, lng: 9.2130 },
  { address: 'Via Novara 30', city: 'Milano', postal: '20153', lat: 45.4720, lng: 9.1200 },
  { address: 'Piazzale Loreto 2', city: 'Milano', postal: '20131', lat: 45.4855, lng: 9.2170 },
]
const COORD = Object.fromEntries(ADDRESSES.map((a) => [a.address, a]))

const rand = (n) => Math.floor(Math.random() * n)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const minToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`

function admin(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function ensureUser(sb) {
  // Find existing demo user by paging users (admin API has no getByEmail).
  let page = 1
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email === DEMO_EMAIL)
    if (hit) return hit.id
    if (data.users.length < 200) break
    page++
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true,
    user_metadata: { full_name: 'Demo Clinic' },
  })
  if (error) throw error
  return data.user.id
}

// Wipe every business owned by the demo profile, then rebuild from scratch.
export async function resetDemo(env = loadEnv()) {
  const sb = admin(env)
  const userId = await ensureUser(sb)

  // Profile: mark onboarding done so login lands on the dashboard.
  await sb.from('profiles').update({
    first_name: 'Demo', last_name: 'Clinic', display_name: 'Demo Clinic',
    language: 'en', timezone: 'Europe/Rome', onboarding_completed: true,
  }).eq('id', userId)

  // Remove old demo businesses (cascade child rows explicitly, no schema assumptions).
  const { data: olds } = await sb.from('business').select('id').eq('profile_id', userId)
  for (const b of olds ?? []) {
    for (const tbl of ['appointments', 'waiting_list', 'patient_availability', 'optimization_changes', 'optimization_runs', 'services', 'working_hours', 'business_holidays', 'algorithm_settings']) {
      await sb.from(tbl).delete().eq('business_id', b.id)
    }
    // patient_availability is keyed by patient; delete via patients below.
    const { data: pats } = await sb.from('patients').select('id').eq('business_id', b.id)
    for (const p of pats ?? []) await sb.from('patient_availability').delete().eq('patient_id', p.id)
    await sb.from('patients').delete().eq('business_id', b.id)
    await sb.from('business').delete().eq('id', b.id)
  }

  // Fresh business
  const { data: biz, error: bErr } = await sb.from('business').insert({
    profile_id: userId, business_name: 'Demo Clinic', business_type: 'physiotherapist',
    timezone: 'Europe/Rome', language: 'en', currency: 'EUR',
    default_appointment_duration: 30, lunch_break_enabled: true, lunch_start: '13:00', lunch_end: '14:00',
    address: STUDIO.address, city: STUDIO.city, postal_code: STUDIO.postal,
    location_latitude: STUDIO.lat, location_longitude: STUDIO.lng,
    location_accuracy_meters: 20, location_source: 'device_geolocation',
    location_captured_at: new Date().toISOString(),
  }).select('id').single()
  if (bErr) throw bErr
  const businessId = biz.id

  // Working hours: Mon–Fri 9–13 / 14–18, weekend closed.
  await sb.from('working_hours').insert(WEEKDAYS.map((d, i) => ({
    business_id: businessId, weekday: d, is_open: i < 5,
    morning_start: i < 5 ? '09:00' : null, morning_end: i < 5 ? '13:00' : null,
    afternoon_start: i < 5 ? '14:00' : null, afternoon_end: i < 5 ? '18:00' : null,
  })))

  // Day starts from the practitioner's home and ends back at the studio (spec
  // §1/§4 edge legs). Travel weight left at the 1.0 default; moves unlimited.
  const HOME = { address: 'Via Padova 100, Milano', latitude: 45.4980, longitude: 9.2320 }
  await sb.from('algorithm_settings').insert({
    business_id: businessId,
    max_patient_moves: 0, max_daily_moves: 0, // unlimited (spec §2)
    metadata: {
      W_TRAVEL: 1,
      start_location: HOME,
      end_location: { address: STUDIO.address, latitude: STUDIO.lat, longitude: STUDIO.lng },
    },
  })

  // Services
  const { data: svcs } = await sb.from('services').insert(
    SERVICES.map((s) => ({ business_id: businessId, ...s, allow_ai_scheduling: true }))
  ).select('id, duration_minutes, price, color, name')

  // Patients — each gets a real Milan address (so voice + routing have data).
  const { data: pats } = await sb.from('patients').insert(
    NAMES.map(([first_name, last_name], i) => {
      const a = ADDRESSES[i % ADDRESSES.length]
      return {
        business_id: businessId, first_name, last_name,
        color: COLORS[i % COLORS.length], is_vip: i % 5 === 0,
        address: a.address, city: a.city, postal_code: a.postal,
      }
    })
  ).select('id, color, address, city, postal_code')

  // Scattered 4-week calendar (Mon–Fri, 2–4/day, deliberate gaps)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const appts = []
  for (let day = 0; day < 28; day++) {
    const d = new Date(today); d.setDate(d.getDate() + day)
    if (((d.getDay() + 6) % 7) > 4) continue
    const count = 2 + rand(3)
    const chosen = [...STARTS].sort(() => Math.random() - 0.5).slice(0, count).sort((a, b) => a - b)
    for (const startMin of chosen) {
      const p = pats[rand(pats.length)]
      const svc = svcs[rand(svcs.length)]
      const co = COORD[p.address]
      appts.push({
        business_id: businessId, patient_id: p.id, service_id: svc.id,
        appointment_date: ymd(d), start_time: minToTime(startMin), end_time: minToTime(startMin + svc.duration_minutes),
        duration_minutes: svc.duration_minutes, price: svc.price, color: svc.color, title: svc.name,
        status: 'scheduled', source: 'manual',
        // Appointment happens at the client's address -> geographic data for the map.
        location_mode: 'custom',
        location_address: p.address, location_city: p.city, location_postal_code: p.postal_code,
        location_latitude: co?.lat ?? null, location_longitude: co?.lng ?? null,
        location_geocoding_status: co ? 'succeeded' : null,
      })
    }
  }
  const { data: inserted } = await sb.from('appointments').insert(appts).select('id, patient_id, appointment_date, service_id, duration_minutes')

  // One "move me up" (advance) waiting-list entry on a far appointment, to show
  // off the feature. Pick the latest appointment.
  const far = [...(inserted ?? [])].sort((a, b) => (a.appointment_date < b.appointment_date ? 1 : -1))[0]
  if (far) {
    const latest = new Date(far.appointment_date + 'T00:00:00'); latest.setDate(latest.getDate() - 3)
    await sb.from('waiting_list').insert({
      business_id: businessId, patient_id: far.patient_id, preferred_service_id: far.service_id,
      preferred_duration_minutes: far.duration_minutes, priority: 'high',
      earliest_date: ymd(today), latest_date: ymd(latest), flexible: true, active: true,
      notes: JSON.stringify({ advance_for: far.id }),
    })
  }

  // Two pool "to plan" entries (spec §7): the optimizer books their sittings
  // across the range, respecting max/week and the minimum gap.
  const in21 = new Date(today); in21.setDate(in21.getDate() + 21)
  const poolSvc = svcs[0]
  const poolPatients = (pats ?? []).slice(0, 2)
  if (poolPatients.length === 2 && poolSvc) {
    await sb.from('waiting_list').insert([
      {
        business_id: businessId, patient_id: poolPatients[0].id, preferred_service_id: poolSvc.id,
        preferred_duration_minutes: poolSvc.duration_minutes, priority: 'normal',
        earliest_date: ymd(today), latest_date: ymd(in21), flexible: true, active: true,
        notes: JSON.stringify({ pool: { sessions_total: 4, max_per_week: 2, gap_hours: 48 } }),
      },
      {
        business_id: businessId, patient_id: poolPatients[1].id, preferred_service_id: poolSvc.id,
        preferred_duration_minutes: poolSvc.duration_minutes, priority: 'high',
        earliest_date: ymd(today), latest_date: ymd(in21), flexible: true, active: true,
        notes: JSON.stringify({ pool: { sessions_total: 2, max_per_week: 1, gap_hours: 72 } }),
      },
    ])
  }

  return { businessId, appointments: appts.length, patients: NAMES.length, services: SERVICES.length }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  resetDemo().then((r) => {
    console.log('✅ Demo seeded:', r)
    console.log(`\n   Login:  ${DEMO_EMAIL}\n   Pass:   ${DEMO_PASSWORD}\n`)
    process.exit(0)
  }).catch((e) => { console.error('❌', e); process.exit(1) })
}
