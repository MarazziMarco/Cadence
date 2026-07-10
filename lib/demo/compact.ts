// Pure, in-memory, client-side "compaction" used only by the public /demo page.
// It mimics the real solver's Phase 2 (fill_gaps_first) idea — pull movable
// appointments earlier to close gaps — but simplified: no weights, no budgets,
// no DB. It never crosses the lunch break (each working window is compacted
// independently) and never moves the first appointment of a window, since
// moving it doesn't reduce measured idle time (nothing to its left to close).

import { WORKING_WINDOWS, type DemoAppointment } from './fixtures'

export interface DemoChange {
  id: string
  patientName: string
  date: string
  oldStart: number
  newStart: number
  duration: number
}

function windowIdle(items: { startMin: number; duration: number }[]): number {
  let idle = 0
  for (let i = 1; i < items.length; i++) {
    const gap = items[i].startMin - (items[i - 1].startMin + items[i - 1].duration)
    if (gap > 0) idle += gap
  }
  return idle
}

/** Packs a window's items left of their original position, keeping the first fixed. */
function compactWindow(items: { id: string; startMin: number; duration: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin)
  const newStarts = new Map<string, number>()
  if (sorted.length === 0) return newStarts
  newStarts.set(sorted[0].id, sorted[0].startMin)
  let cursor = sorted[0].startMin + sorted[0].duration
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i]
    const start = Math.min(cursor, it.startMin)
    newStarts.set(it.id, start)
    cursor = start + it.duration
  }
  return newStarts
}

export function compactWeek(appts: DemoAppointment[]): {
  compacted: DemoAppointment[]
  changes: DemoChange[]
  minutesRecovered: number
} {
  const byDate = new Map<string, DemoAppointment[]>()
  for (const a of appts) {
    if (!byDate.has(a.date)) byDate.set(a.date, [])
    byDate.get(a.date)!.push(a)
  }

  const startsById = new Map<string, number>()
  let minutesRecovered = 0

  for (const dayAppts of byDate.values()) {
    for (const win of WORKING_WINDOWS) {
      const inWin = dayAppts.filter((a) => a.startMin >= win.start && a.startMin + a.duration <= win.end)
      if (inWin.length === 0) continue
      if (inWin.length < 2) { startsById.set(inWin[0].id, inWin[0].startMin); continue }
      minutesRecovered += windowIdle(inWin)
      compactWindow(inWin).forEach((v, k) => startsById.set(k, v))
    }
  }

  const changes: DemoChange[] = []
  const compacted = appts.map((a) => {
    const newStart = startsById.get(a.id) ?? a.startMin
    if (newStart !== a.startMin) {
      changes.push({ id: a.id, patientName: a.patientName, date: a.date, oldStart: a.startMin, newStart, duration: a.duration })
    }
    return { ...a, startMin: newStart }
  })

  changes.sort((a, b) => (a.date === b.date ? a.oldStart - b.oldStart : a.date.localeCompare(b.date)))

  return { compacted, changes, minutesRecovered }
}
