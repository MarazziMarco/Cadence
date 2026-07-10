// Static fixture data for the public "/demo" page. No DB, no auth — the whole
// demo runs client-side in memory. The week is always "this week" (Mon–Fri,
// recomputed from today's date) but the appointments themselves are fixed, so
// re-entering /demo always shows the same schedule and the same gaps.

export interface DemoAppointment {
  id: string
  patientName: string
  color: string
  date: string // YYYY-MM-DD
  weekdayOffset: number // 0=Mon .. 6=Sun
  startMin: number // minutes from midnight
  duration: number // minutes
}

export const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

// Same working hours used across the app's demo story: 09–13 / 14–18, lunch break in between.
export const WORKING_WINDOWS = [
  { start: 9 * 60, end: 13 * 60 },
  { start: 14 * 60, end: 18 * 60 },
]

interface FixtureItem {
  id: string
  patientName: string
  color: string
  startMin: number
  duration: number
}

const PALETTE = ['#4f46e5', '#db2777', '#059669', '#d97706', '#0891b2']

const FIXTURES: Record<number, FixtureItem[]> = {
  0: [
    // Lunedì — il caso classico: un buco di 2 ore tra due appuntamenti.
    { id: 'demo-mon-1', patientName: 'Marco Rossi', color: PALETTE[0], startMin: 9 * 60, duration: 30 },
    { id: 'demo-mon-2', patientName: 'Giulia Bianchi', color: PALETTE[1], startMin: 11 * 60 + 30, duration: 30 },
  ],
  1: [
    // Martedì — giornata già quasi compatta, poco da ottimizzare.
    { id: 'demo-tue-1', patientName: 'Luca Verdi', color: PALETTE[2], startMin: 9 * 60, duration: 45 },
    { id: 'demo-tue-2', patientName: 'Sara Neri', color: PALETTE[3], startMin: 9 * 60 + 45, duration: 30 },
    { id: 'demo-tue-3', patientName: 'Elena Conti', color: PALETTE[4], startMin: 14 * 60, duration: 30 },
  ],
  2: [
    // Mercoledì — 3 appuntamenti sparsi con vuoti evidenti tra loro.
    { id: 'demo-wed-1', patientName: 'Paolo Ferrari', color: PALETTE[1], startMin: 9 * 60 + 30, duration: 30 },
    { id: 'demo-wed-2', patientName: 'Anna Ricci', color: PALETTE[0], startMin: 11 * 60 + 15, duration: 30 },
    { id: 'demo-wed-3', patientName: 'Davide Moretti', color: PALETTE[2], startMin: 16 * 60, duration: 45 },
  ],
  3: [
    // Giovedì — due buchi, mattina e pomeriggio.
    { id: 'demo-thu-1', patientName: 'Chiara Galli', color: PALETTE[3], startMin: 10 * 60, duration: 45 },
    { id: 'demo-thu-2', patientName: 'Fabio Costa', color: PALETTE[4], startMin: 12 * 60 + 15, duration: 45 },
    { id: 'demo-thu-3', patientName: 'Martina Lombardi', color: PALETTE[0], startMin: 14 * 60 + 30, duration: 30 },
    { id: 'demo-thu-4', patientName: 'Simone Greco', color: PALETTE[1], startMin: 17 * 60, duration: 45 },
  ],
  4: [
    // Venerdì — giornata leggera, un solo appuntamento.
    { id: 'demo-fri-1', patientName: 'Valentina Serra', color: PALETTE[2], startMin: 9 * 60, duration: 45 },
  ],
}

function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function demoWeekDays(): Date[] {
  const monday = startOfWeek(new Date())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
}

/** Deterministic per calendar week: same fixed fake appointments every visit. */
export function generateDemoWeek(): DemoAppointment[] {
  const days = demoWeekDays()
  const out: DemoAppointment[] = []
  for (const [offsetStr, items] of Object.entries(FIXTURES)) {
    const offset = Number(offsetStr)
    const dateStr = ymd(days[offset])
    for (const it of items) out.push({ ...it, date: dateStr, weekdayOffset: offset })
  }
  return out
}
