// Local, rule-based parser that turns a free-text (voice-transcribed) phrase
// into appointment fields. No paid AI / no network — pure string logic, IT + EN.
//
// Span-based: date / time / service / duration / address / availability spans are
// resolved and removed FIRST, and whatever readable text remains is the client
// name candidate. The name is then resolved to an existing client (exact or
// unique partial), an ambiguous set (duplicate names), a validated new-client
// proposal, or nothing. Deliberately forgiving: anything it can't find stays
// null and the user fills it in.

import type { DayAvailabilityState } from '@/lib/api/patients'

// Weekday names as stored in the DB (Weekday type). Index = ISO Mon..Sun.
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type WeekdayName = (typeof WEEKDAY_NAMES)[number]

export type PatientResolution =
  | { kind: 'existing'; id: string; displayName: string; storedAddress: string | null }
  | { kind: 'new'; proposedName: string }
  | { kind: 'ambiguous'; proposedName: string; candidateIds: string[] }
  | { kind: 'none' }

export interface AvailabilityPatch {
  mode: 'merge' | 'replace'
  days: Partial<Record<WeekdayName, DayAvailabilityState>>
}

export interface ParsedAppt {
  patient: PatientResolution
  date: string | null // YYYY-MM-DD
  time: string | null // HH:MM
  serviceId: string | null
  serviceName: string | null
  durationMinutes: number | null
  clientAddress: string | null // address anchored to the client ("abita in …")
  appointmentAddress: string | null // where THIS appointment happens ("in via …")
  availability: AvailabilityPatch | null
}

export interface PatientLite { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null; address?: string | null }
export interface ServiceLite { id: string; name: string; duration_minutes: number }

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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Whole-word match that also works for accented words (JS \b treats à/ì/è as
// boundaries, which breaks "venerdì"/"martedì"). Uses Unicode letter classes.
function wordRe(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, 'iu')
}

// Replace the first match of `re` in `residual` with spaces (so downstream name
// resolution never sees consumed spans). Returns [matchedText|null, newResidual].
function strip(residual: string, re: RegExp): [string | null, string] {
  const m = residual.match(re)
  if (!m || m.index === undefined) return [null, residual]
  const start = m.index
  const end = start + m[0].length
  return [m[0], residual.slice(0, start) + ' '.repeat(m[0].length) + residual.slice(end)]
}

// dow from WEEKDAYS (0=Sun..6=Sat) -> ISO name index (0=Mon..6=Sun)
function dowToName(dow: number): WeekdayName {
  return WEEKDAY_NAMES[(dow + 6) % 7]
}

// ---- date ------------------------------------------------------------------
function resolveDate(residual: string, today: Date): [string | null, string] {
  const patterns: RegExp[] = [
    /\bdopodomani\b|\bday after tomorrow\b/i,
    /\bdomani\b|\btomorrow\b/i,
    /\boggi\b|\btoday\b/i,
  ]
  const relDays = [2, 1, 0]
  for (let i = 0; i < patterns.length; i++) {
    const [span, next] = strip(residual, patterns[i])
    if (span) { const d = new Date(today); d.setDate(d.getDate() + relDays[i]); return [ymd(d), next] }
  }
  // Weekday name -> next upcoming occurrence.
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    const [span, next] = strip(residual, wordRe(name))
    if (span) {
      const d = new Date(today)
      let delta = (dow - d.getDay() + 7) % 7
      if (delta === 0) delta = 7
      d.setDate(d.getDate() + delta)
      return [ymd(d), next]
    }
  }
  // "15 marzo" / "15 march"
  const dm = residual.match(/(\d{1,2})\s+(\p{L}+)/u)
  if (dm && MONTHS[dm[2].toLowerCase()]) {
    const day = parseInt(dm[1]); const month = MONTHS[dm[2].toLowerCase()]
    let year = today.getFullYear()
    const cand = new Date(year, month - 1, day)
    if (cand < new Date(today.getFullYear(), today.getMonth(), today.getDate())) year++
    const [, next] = strip(residual, new RegExp(escapeRe(dm[0]), 'i'))
    return [ymd(new Date(year, month - 1, day)), next]
  }
  // dd/mm or dd/mm/yyyy
  const num = residual.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/)
  if (num) {
    const day = parseInt(num[1]); const month = parseInt(num[2])
    let year = num[3] ? parseInt(num[3]) : today.getFullYear()
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const [, next] = strip(residual, new RegExp(escapeRe(num[0])))
      return [ymd(new Date(year, month - 1, day)), next]
    }
  }
  // "il 15" (IT) or "20th" (EN ordinal)
  const dom = residual.match(/\bil\s+(\d{1,2})\b/i) || residual.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i)
  if (dom) {
    const day = parseInt(dom[1])
    let d = new Date(today.getFullYear(), today.getMonth(), day)
    if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d = new Date(today.getFullYear(), today.getMonth() + 1, day)
    const [, next] = strip(residual, new RegExp(escapeRe(dom[0]), 'i'))
    return [ymd(d), next]
  }
  return [null, residual]
}

// ---- time ------------------------------------------------------------------
function resolveTime(residual: string): [string | null, string] {
  let m = residual.match(/(?:alle|ore|at)?\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?/i)
  if (m) {
    let h = parseInt(m[1]); const min = parseInt(m[2])
    if (/pm/i.test(m[3] || '') && h < 12) h += 12
    if (/am/i.test(m[3] || '') && h === 12) h = 0
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      const [, next] = strip(residual, new RegExp(escapeRe(m[0]), 'i'))
      return [`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, next]
    }
  }
  m = residual.match(/(?:alle|ore|at)\s*(\d{1,2})\s*(am|pm)?/i) || residual.match(/\b(\d{1,2})\s*(am|pm)\b/i)
  if (m) {
    let h = parseInt(m[1])
    if (/pm/i.test(m[2] || '') && h < 12) h += 12
    if (/am/i.test(m[2] || '') && h === 12) h = 0
    if (h >= 0 && h <= 23) {
      const [, next] = strip(residual, new RegExp(escapeRe(m[0]), 'i'))
      return [`${String(h).padStart(2, '0')}:00`, next]
    }
  }
  return [null, residual]
}

// ---- service + duration ----------------------------------------------------
function resolveService(residual: string, services: ServiceLite[]): [ServiceLite | null, string] {
  const t = residual.toLowerCase()
  // Longest service name first, so "deep tissue massage" wins over "massage".
  const sorted = [...services].filter((s) => s.name).sort((a, b) => b.name.length - a.name.length)
  for (const s of sorted) {
    if (t.includes(s.name.toLowerCase())) {
      const [, next] = strip(residual, new RegExp(escapeRe(s.name), 'i'))
      return [s, next]
    }
  }
  return [null, residual]
}

function resolveDuration(residual: string): [number | null, string] {
  const m = residual.match(/\b(\d{2,3})\s*(?:min|minuti|minutes|minute)\b/i)
  if (!m) return [null, residual]
  const [, next] = strip(residual, new RegExp(escapeRe(m[0]), 'i'))
  return [parseInt(m[1]), next]
}

// ---- address ---------------------------------------------------------------
// Client-anchored ("abita/vive/residente/lives/resides") -> clientAddress.
// Appointment-anchored or a bare street phrase -> appointmentAddress.
// Shared stop set: an address value ends at the next anchor, availability
// keyword, time/date word, or punctuation. Anchors are included so a combined
// "abita in X appuntamento in Y" splits into two addresses.
const ADDR_STOP = '(?:\\s+(?:solo|soltanto|only|non|not|mai|never|preferisce|prefer|meglio|alle|ore|at|domani|oggi|dopodomani|tomorrow|today|appuntamento|appointment|vieni|incontro|meet|abita|vive|residente|domicilio|lives?|resides?)\\b)|[,.;]|$'
const CLIENT_ADDR = new RegExp(`\\b(?:abita|vive|residente|domicilio|lives?|resides?)\\s+(?:a|in|at|presso)\\s+(.+?)(?=${ADDR_STOP})`, 'i')
const APPT_ADDR = new RegExp(`\\b(?:appuntamento|vieni|incontro|meet|appointment)\\s+(?:a|in|at|presso|da)\\s+(.+?)(?=${ADDR_STOP})`, 'i')
const STREET = new RegExp(`\\b((?:via|viale|piazza|corso|strada|vicolo|street|st\\.|road|rd\\.|avenue|ave\\.?)\\s+.+?)(?=${ADDR_STOP})`, 'i')

function resolveAddresses(residual: string): { clientAddress: string | null; appointmentAddress: string | null; residual: string } {
  let clientAddress: string | null = null
  let appointmentAddress: string | null = null
  let r = residual

  const c = r.match(CLIENT_ADDR)
  if (c) { clientAddress = c[1].trim(); ;[, r] = strip(r, new RegExp(escapeRe(c[0]), 'i')) }

  const a = r.match(APPT_ADDR)
  if (a) { appointmentAddress = a[1].trim(); ;[, r] = strip(r, new RegExp(escapeRe(a[0]), 'i')) }

  // A bare street phrase with no anchor is the appointment location.
  if (!appointmentAddress) {
    const s = r.match(STREET)
    if (s) { appointmentAddress = s[1].trim(); ;[, r] = strip(r, new RegExp(escapeRe(s[0]), 'i')) }
  }
  return { clientAddress, appointmentAddress, residual: r }
}

// ---- availability ----------------------------------------------------------
// Availability clause openers. Matched via wordRe (Unicode-aware) rather than a
// single \b-wrapped regex, because JS \b breaks after accented letters ("può").
const AVAIL_TERMS = [
  'solo', 'soltanto', 'disponibile', 'disponibili', 'disponibilità',
  'only', 'available', 'preferisce', 'prefer', 'prefers', 'meglio',
  'mai', 'never', 'non', 'not',
]

function resolveAvailability(residual: string): [AvailabilityPatch | null, string] {
  // Earliest trigger term in the text opens the availability clause.
  let clauseStart = -1
  let triggerTerm = ''
  for (const term of AVAIL_TERMS) {
    const mm = residual.match(wordRe(term))
    if (mm && mm.index !== undefined && (clauseStart === -1 || mm.index < clauseStart)) {
      clauseStart = mm.index; triggerTerm = term
    }
  }
  if (clauseStart === -1) return [null, residual]
  const m = { 0: triggerTerm, index: clauseStart } as unknown as RegExpMatchArray
  const clause = residual.slice(clauseStart)

  // days mentioned in the clause
  const days: WeekdayName[] = []
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (wordRe(name).test(clause)) { const w = dowToName(dow); if (!days.includes(w)) days.push(w) }
  }

  const morning = /\bmattin[ao]\b|\bmorning\b|\bpresto\b|\bearly\b/i.test(clause)
  const afternoon = /\bpomeriggio\b|\bafternoon\b|\bsera\b|\bevening\b|\btardi\b|\blate\b/i.test(clause)
  const negation = /\bnon\b|\bnot\b|\bmai\b|\bnever\b/i.test(clause)
  const soft = /\bpreferisce\b|\bprefer(?:s)?\b|\bmeglio\b/i.test(clause)
  const onlyKw = /\bsolo\b|\bsoltanto\b|\bonly\b/i.test(clause)

  const targets = days.length ? days : ([...WEEKDAY_NAMES] as WeekdayName[])
  const patchDays: Partial<Record<WeekdayName, DayAvailabilityState>> = {}
  let mode: 'merge' | 'replace' = 'merge'

  if (negation) {
    // Hard negation: the named days become unavailable, keep the rest.
    if (!days.length) return [null, residual] // "non ..." with no day: nothing actionable
    for (const d of days) patchDays[d] = 'unavailable'
    mode = 'merge'
  } else if (morning || afternoon) {
    const state: DayAvailabilityState = soft
      ? (morning ? 'prefer_morning' : 'prefer_afternoon')
      : onlyKw ? (morning ? 'morning_only' : 'afternoon_only')
      : (morning ? 'prefer_morning' : 'prefer_afternoon')
    for (const d of targets) patchDays[d] = state
    // A hard "solo di mattina" restricts times, not the day-set -> merge.
    mode = 'merge'
  } else if (days.length) {
    // "(solo) il lunedì e mercoledì" -> those days available, the rest replaced.
    for (const d of days) patchDays[d] = 'all_day'
    mode = 'replace'
  } else {
    return [null, residual]
  }

  // Strip only availability tokens (trigger, its weekdays, part-of-day, keywords)
  // so a trailing time/service ("… solo lunedì alle 10 fisio") survives for the
  // later resolvers. Never strip the whole clause tail.
  let next = strip(residual, new RegExp(escapeRe(m[0]), 'i'))[1]
  for (const [name] of Object.entries(WEEKDAYS)) {
    if (wordRe(name).test(clause)) next = strip(next, wordRe(name))[1]
  }
  const KEYWORDS = /\b(?:solo|soltanto|only|disponibil[ei]|disponibilità|available|preferisce|prefer(?:s)?|meglio|mai|never|non|not|può|puo|puoi|mattin[ao]|morning|presto|early|pomeriggio|afternoon|sera|evening|tardi|late)\b/giu
  next = next.replace(KEYWORDS, (mm) => ' '.repeat(mm.length))
  return [{ mode, days: patchDays }, next]
}

// ---- name resolution -------------------------------------------------------
const NAME_FILLER = new Set([
  // IT
  'appuntamento', 'con', 'per', 'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno',
  'di', 'da', 'a', 'in', 'e', 'ed', 'del', 'della', 'dello', 'nuovo', 'nuova', 'cliente',
  'signor', 'signora', 'sig', 'prenota', 'prenotare', 'fissa', 'metti',
  // EN
  'appointment', 'with', 'for', 'the', 'an', 'at', 'of', 'to', 'and', 'new', 'client',
  'mr', 'mrs', 'ms', 'on', 'book', 'schedule', 'add',
])

function titleCase(s: string): string {
  return s.split(/\s+/).filter(Boolean).map((w) => w.split('-').map((p) => p ? p[0].toUpperCase() + p.slice(1) : p).join('-')).join(' ')
}

function cleanNameCandidate(residual: string): string {
  return residual
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !NAME_FILLER.has(w.toLowerCase()))
    .join(' ')
    .trim()
}

function displayName(p: PatientLite): string {
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.first_name || 'Client'
}

function resolvePatient(residual: string, patients: PatientLite[]): PatientResolution {
  const candidate = cleanNameCandidate(residual)
  if (!candidate) return { kind: 'none' }
  const cand = candidate.toLowerCase()

  // 1. Exact full-name match (whole word).
  const fullMatches = patients.filter((p) => {
    const full = (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ')).toLowerCase()
    return full && wordRe(full).test(cand)
  })
  if (fullMatches.length === 1) {
    const p = fullMatches[0]
    return { kind: 'existing', id: p.id, displayName: displayName(p), storedAddress: p.address ?? null }
  }
  if (fullMatches.length > 1) {
    return { kind: 'ambiguous', proposedName: titleCase(candidate), candidateIds: fullMatches.map((p) => p.id) }
  }

  // 2. Partial match on first OR last name.
  const partial = patients.filter((p) => {
    const first = (p.first_name || '').toLowerCase()
    const last = (p.last_name || '').toLowerCase()
    return (first && wordRe(first).test(cand)) || (last && wordRe(last).test(cand))
  })
  if (partial.length === 1) {
    const p = partial[0]
    return { kind: 'existing', id: p.id, displayName: displayName(p), storedAddress: p.address ?? null }
  }
  if (partial.length > 1) {
    return { kind: 'ambiguous', proposedName: titleCase(candidate), candidateIds: partial.map((p) => p.id) }
  }

  // 3. No match but we have a plausible name -> propose a new client.
  if (/\p{L}{2,}/u.test(candidate)) return { kind: 'new', proposedName: titleCase(candidate) }
  return { kind: 'none' }
}

export function parseAppointment(text: string, patients: PatientLite[], services: ServiceLite[], today = new Date()): ParsedAppt {
  let residual = text

  // Availability first: it claims its own weekday tokens so the date resolver
  // doesn't mistake "solo il lunedì" for the appointment day.
  const [availability, r0] = resolveAvailability(residual); residual = r0
  const [date, r1] = resolveDate(residual, today); residual = r1
  const [time, r2] = resolveTime(residual); residual = r2
  const [service, r3] = resolveService(residual, services); residual = r3
  const [durExplicit, r4] = resolveDuration(residual); residual = r4
  const { clientAddress, appointmentAddress, residual: r5 } = resolveAddresses(residual); residual = r5

  const patient = resolvePatient(residual, patients)

  return {
    patient,
    date,
    time,
    serviceId: service?.id ?? null,
    serviceName: service?.name ?? null,
    durationMinutes: durExplicit ?? service?.duration_minutes ?? null,
    clientAddress,
    appointmentAddress,
    availability,
  }
}
