// Pure heuristic day optimizer. No side effects.
// Hard constraints: open windows, lunch break, no overlap, locked stay put, patient availability.
// Soft goals: reduce idle (compact), fill gaps from waiting list, protect VIP (placed first).

export interface Seg { s: number; e: number }
export interface EngineAppt { id: string; patient_id: string; patient_name: string; duration: number; price: number; locked: boolean; start: number; end: number; is_vip: boolean; color: string; service_id: string | null; service_name?: string | null }
export interface EngineWaiting { id: string; patient_id: string; patient_name: string; duration: number; price: number; priority: string; preferred_weekdays: string[] | null; earliest: number | null; latest: number | null; color: string; service_id: string | null; service_name?: string | null }
export interface EngineWeights { idle: number; waiting: number; revenue: number; free_slots: number; vip: number }

function subtract(segs: Seg[], cuts: Seg[]): Seg[] {
  let out = segs.map((s) => ({ ...s }))
  for (const c of cuts) {
    const next: Seg[] = []
    for (const s of out) {
      if (c.e <= s.s || c.s >= s.e) { next.push(s); continue }
      if (c.s > s.s) next.push({ s: s.s, e: Math.min(c.s, s.e) })
      if (c.e < s.e) next.push({ s: Math.max(c.e, s.s), e: s.e })
    }
    out = next.filter((s) => s.e - s.s > 0)
  }
  return out.sort((a, b) => a.s - b.s)
}

function inWindows(avail: Seg[] | undefined, s: number, e: number): boolean {
  if (!avail || avail.length === 0) return true
  return avail.some((w) => s >= w.s && e <= w.e)
}

function earliestSlot(gaps: Seg[], dur: number, avail: Seg[] | undefined, pref?: [number, number]): number | null {
  for (const g of gaps) {
    const lo = pref ? Math.max(g.s, pref[0]) : g.s
    const hi = pref ? Math.min(g.e, pref[1]) : g.e
    for (let c = lo; c + dur <= hi; c += 5) {
      if (inWindows(avail, c, c + dur)) return c
    }
  }
  return null
}

function computeIdle(windows: Seg[], occ: Seg[]): number {
  let idle = 0
  for (const w of windows) {
    const inside = occ.map((o) => ({ s: Math.max(o.s, w.s), e: Math.min(o.e, w.e) })).filter((o) => o.e > o.s).sort((a, b) => a.s - b.s)
    if (inside.length === 0) continue
    let cursor = w.s
    for (const o of inside) { if (o.s > cursor) idle += o.s - cursor; cursor = Math.max(cursor, o.e) }
  }
  return idle
}

const m2t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const PRIO: Record<string, number> = { high: 3, normal: 2, low: 1 }

export function optimizeDay(input: {
  date: string; weekday: string; windows: Seg[]; lunch: Seg | null;
  appts: EngineAppt[]; availabilityByPatient: Record<string, Seg[]>; waiting: EngineWaiting[];
  maxDaily: number | null; weights: EngineWeights;
}) {
  const { windows, lunch, appts, availabilityByPatient, waiting, maxDaily, weights, weekday, date } = input
  const free = subtract(windows, lunch ? [lunch] : [])

  const locked = appts.filter((a) => a.locked).map((a) => ({ s: a.start, e: a.end }))
  const occupied: Seg[] = [...locked]
  const placed: { a: EngineAppt; s: number; e: number }[] = appts.filter((a) => a.locked).map((a) => ({ a, s: a.start, e: a.end }))

  const movable = appts.filter((a) => !a.locked).sort((x, y) => (y.is_vip ? 1 : 0) - (x.is_vip ? 1 : 0) || x.start - y.start)
  for (const a of movable) {
    const slot = earliestSlot(subtract(free, occupied), a.duration, availabilityByPatient[a.patient_id])
    const s = slot == null ? a.start : slot
    placed.push({ a, s, e: s + a.duration }); occupied.push({ s, e: s + a.duration })
  }

  const changes = placed.filter((p) => !p.a.locked && p.s !== p.a.start).map((p) => {
    const earlier = p.a.start - p.s
    const reason = earlier > 0
      ? `Moved earlier from ${m2t(p.a.start)} to ${m2t(p.s)} to close a ${earlier}-minute gap.${p.a.is_vip ? ' Kept this VIP client in a prime slot.' : ''}`
      : `Rescheduled from ${m2t(p.a.start)} to ${m2t(p.s)} to fit availability and avoid overlaps.`
    return { appointment_id: p.a.id, patient_id: p.a.patient_id, patient_name: p.a.patient_name, old_start: p.a.start, new_start: p.s, dur: p.a.duration, is_vip: p.a.is_vip, color: p.a.color, reason }
  })

  // Fill from waiting list
  const created: any[] = []
  const sortedWaiting = [...waiting].sort((a, b) => (PRIO[b.priority] || 2) - (PRIO[a.priority] || 2))
  for (const w of sortedWaiting) {
    if (maxDaily && placed.length + created.length >= maxDaily) break
    const allowed = !w.preferred_weekdays || w.preferred_weekdays.length === 0 || w.preferred_weekdays.includes(weekday)
    if (!allowed) continue
    const pref: [number, number] | undefined = (w.earliest != null || w.latest != null) ? [w.earliest ?? 0, w.latest ?? 24 * 60] : undefined
    const slot = earliestSlot(subtract(free, occupied), w.duration, availabilityByPatient[w.patient_id], pref)
    if (slot == null) continue
    occupied.push({ s: slot, e: slot + w.duration })
    created.push({ waiting_id: w.id, patient_id: w.patient_id, patient_name: w.patient_name, service_id: w.service_id, service_name: w.service_name, start: slot, dur: w.duration, price: w.price, color: w.color, priority: w.priority,
      reason: `Filled a ${w.duration}-minute opening at ${m2t(slot)} with ${w.patient_name} from the waiting list (${w.priority} priority).` })
  }

  const idleBefore = computeIdle(free, appts.map((a) => ({ s: a.start, e: a.end })))
  const idleAfter = computeIdle(free, occupied)
  const revenueBefore = appts.reduce((s, a) => s + (a.price || 0), 0)
  const revenueAfter = revenueBefore + created.reduce((s, c) => s + (c.price || 0), 0)
  const moved = changes.length
  const unchanged = placed.length - moved
  const score = Math.round(Math.max(0, idleBefore - idleAfter) * weights.idle + created.length * 10 * weights.waiting + (revenueAfter - revenueBefore) * weights.revenue)

  return {
    date, weekday, changes, created,
    metrics: { idleBefore, idleAfter, idleSaved: Math.max(0, idleBefore - idleAfter), revenueBefore, revenueAfter, moved, unchanged, createdN: created.length, total: appts.length, score, violations: 0 },
  }
}
