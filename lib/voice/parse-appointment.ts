// Local, rule-based parser that turns a free-text (voice-transcribed) phrase
// into appointment fields. No paid AI / no network — pure string logic, IT + EN.
// Deliberately forgiving: whatever it can't find stays null and the user fills it.

// Weekday names as stored in the DB (Weekday type). Index = ISO Mon..Sun.
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type WeekdayName = (typeof WEEKDAY_NAMES)[number]

export interface ParsedAppt {
  patientId: string | null
  patientName: string | null
  date: string | null // YYYY-MM-DD
  time: string | null // HH:MM
  serviceId: string | null
  serviceName: string | null
  durationMinutes: number | null
  // Everything else the phrase says about *this* appointment / client:
  preferredPartOfDay: 'morning' | 'afternoon' | null // soft nudge (weight_patient_preference)
  availableWeekdays: WeekdayName[] | null // hard restriction ("only Mondays") — null = no limit
}

interface PatientLite { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null }
interface ServiceLite { id: string; name: string; duration_minutes: number }

const WEEKDAYS: Record<string, number> = {
  // JS getDay(): 0=Sun .. 6=Sat
  domenica: 0, sunday: 0,
  lunedì: 1, lunedi: 1, monday: 1,
  martedì: 2, martedi: 2, tuesday: 2,
  mercoledì: 3, mercoledi: 3, wednesday: 3,
  giovedì: 4, giovedi: 4, thursday: 4,
  venerdì: 5, venerdi: 5, friday: 5,
  sabato: 6, saturday: 6,
}

const MONTHS: Record<string, number> = {
  gennaio: 1, january: 1, febbraio: 2, february: 2, marzo: 3, march: 3,
  aprile: 4, april: 4, maggio: 5, may: 5, giugno: 6, june: 6,
  luglio: 7, july: 7, agosto: 8, august: 8, settembre: 9, september: 9,
  ottobre: 10, october: 10, novembre: 11, november: 11, dicembre: 12, december: 12,
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Whole-word match that also works for accented words (JS \b treats à/ì/è as
// boundaries, which breaks "venerdì"/"martedì"). Uses Unicode letter classes.
function wordRe(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, 'iu')
}

function resolveDate(text: string, today = new Date()): string | null {
  const t = text.toLowerCase()

  if (/\bdopodomani\b|\bday after tomorrow\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate() + 2); return ymd(d) }
  if (/\bdomani\b|\btomorrow\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate() + 1); return ymd(d) }
  if (/\boggi\b|\btoday\b/.test(t)) return ymd(today)

  // Weekday name -> next upcoming occurrence.
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (wordRe(name).test(t)) {
      const d = new Date(today)
      let delta = (dow - d.getDay() + 7) % 7
      if (delta === 0) delta = 7
      d.setDate(d.getDate() + delta)
      return ymd(d)
    }
  }

  // "15 marzo" / "15 march"
  const dm = t.match(/(\d{1,2})\s+(\p{L}+)/u)
  if (dm && MONTHS[dm[2]]) {
    const day = parseInt(dm[1]); const month = MONTHS[dm[2]]
    let year = today.getFullYear()
    const cand = new Date(year, month - 1, day)
    if (cand < new Date(today.getFullYear(), today.getMonth(), today.getDate())) year++
    return ymd(new Date(year, month - 1, day))
  }

  // dd/mm or dd/mm/yyyy
  const num = t.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/)
  if (num) {
    const day = parseInt(num[1]); const month = parseInt(num[2])
    let year = num[3] ? parseInt(num[3]) : today.getFullYear()
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return ymd(new Date(year, month - 1, day))
  }

  // "il 15" (IT) or "the 20th" / "20th" (EN ordinal) -> day of current month
  // (or next month if the day has already passed).
  const dom = t.match(/\bil\s+(\d{1,2})\b/) || t.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/)
  if (dom) {
    const day = parseInt(dom[1])
    let d = new Date(today.getFullYear(), today.getMonth(), day)
    if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d = new Date(today.getFullYear(), today.getMonth() + 1, day)
    return ymd(d)
  }

  return null
}

function resolveTime(text: string): string | null {
  const t = text.toLowerCase()

  // HH:MM or HH.MM (optionally after alle/ore/at)
  let m = t.match(/(?:alle|ore|at)?\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?/)
  if (m) {
    let h = parseInt(m[1]); const min = parseInt(m[2])
    if (m[3] === 'pm' && h < 12) h += 12
    if (m[3] === 'am' && h === 12) h = 0
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  // "alle 15", "ore 9", "at 3pm", "3 pm"
  m = t.match(/(?:alle|ore|at)\s*(\d{1,2})\s*(am|pm)?/) || t.match(/\b(\d{1,2})\s*(am|pm)\b/)
  if (m) {
    let h = parseInt(m[1])
    if (m[2] === 'pm' && h < 12) h += 12
    if (m[2] === 'am' && h === 12) h = 0
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`
  }

  return null
}

function matchPatient(text: string, patients: PatientLite[]): PatientLite | null {
  const t = text.toLowerCase()
  // Prefer full name, then first name, then last name; whole-word (accent-safe).
  const byFull = patients.find((p) => p.full_name && wordRe(p.full_name.toLowerCase()).test(t))
  if (byFull) return byFull
  const byFirst = patients.find((p) => p.first_name && wordRe(p.first_name.toLowerCase()).test(t))
  if (byFirst) return byFirst
  const byLast = patients.find((p) => p.last_name && wordRe(p.last_name.toLowerCase()).test(t))
  return byLast ?? null
}

function matchService(text: string, services: ServiceLite[]): ServiceLite | null {
  const t = text.toLowerCase()
  return services.find((s) => s.name && t.includes(s.name.toLowerCase())) ?? null
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// dow from WEEKDAYS (0=Sun..6=Sat) -> ISO name index (0=Mon..6=Sun)
function dowToName(dow: number): WeekdayName {
  return WEEKDAY_NAMES[(dow + 6) % 7]
}

// Preferred part of day (soft) — "di mattina", "prefers afternoons", "presto"/"tardi".
function resolvePartOfDay(t: string): 'morning' | 'afternoon' | null {
  if (/\bmattin[ao]\b|\bmorning\b|\bpresto\b|\bearly\b/.test(t)) return 'morning'
  if (/\bpomeriggio\b|\bafternoon\b|\bsera\b|\bevening\b|\btardi\b|\blate\b/.test(t)) return 'afternoon'
  return null
}

// Hard weekday availability ("solo il lunedì", "only on mondays and fridays").
// Only weekdays mentioned AFTER an availability trigger count, so the appointment
// day itself ("venerdì alle 10") isn't mistaken for a recurring restriction.
const AVAIL_TRIGGER = /\b(?:solo|soltanto|disponibil[ei]|disponibilità|only|available|puo?\s+venire|viene solo)\b/iu
function resolveAvailableWeekdays(t: string): WeekdayName[] | null {
  const m = AVAIL_TRIGGER.exec(t)
  if (!m) return null
  const tail = t.slice(m.index + m[0].length)
  const found = new Set<WeekdayName>()
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (wordRe(name).test(tail)) found.add(dowToName(dow))
  }
  return found.size ? [...found] : null
}

export function parseAppointment(text: string, patients: PatientLite[], services: ServiceLite[], today = new Date()): ParsedAppt {
  const patient = matchPatient(text, patients)
  const service = matchService(text, services)

  // Explicit "45 minuti/minutes" duration overrides the service default.
  const lower = text.toLowerCase()
  const durMatch = lower.match(/\b(\d{2,3})\s*(?:min|minuti|minutes)\b/)
  const duration = durMatch ? parseInt(durMatch[1]) : service?.duration_minutes ?? null

  return {
    patientId: patient?.id ?? null,
    patientName: patient ? (patient.full_name || patient.first_name || null) : null,
    date: resolveDate(text, today),
    time: resolveTime(text),
    serviceId: service?.id ?? null,
    serviceName: service?.name ?? null,
    durationMinutes: duration,
    preferredPartOfDay: resolvePartOfDay(lower),
    availableWeekdays: resolveAvailableWeekdays(lower),
  }
}
