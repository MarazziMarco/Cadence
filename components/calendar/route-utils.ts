// Pure geometry + route-order helpers shared by the day-route map. View-only:
// nothing here mutates data or calls the optimizer — it just draws a sensible
// visiting order for a single day (start → stops → end).

export type LL = { lat: number; lng: number }

export function haversineKm(a: LL, b: LL): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Length of start -> stops (in order) -> end. Absent start/end are skipped.
export function tripKm(start: LL | null, end: LL | null, stops: LL[]): number {
  const seq = [...(start ? [start] : []), ...stops, ...(end ? [end] : [])]
  let total = 0
  for (let i = 1; i < seq.length; i++) total += haversineKm(seq[i - 1], seq[i])
  return total
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) out.push([arr[i], ...p])
  }
  return out
}

function twoOpt(start: LL | null, end: LL | null, order: number[], pts: LL[]): number[] {
  let best = order
  let bestD = tripKm(start, end, best.map((i) => pts[i]))
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)]
        const d = tripKm(start, end, cand.map((j) => pts[j]))
        if (d < bestD - 1e-9) { best = cand; bestD = d; improved = true }
      }
    }
  }
  return best
}

// Shortest visiting order start -> stops -> end. Exact for few stops, else
// nearest-neighbour + 2-opt. Distance <= the time-sorted order.
export function bestOrder(start: LL | null, end: LL | null, pts: LL[]): number[] {
  const n = pts.length
  const idx = pts.map((_, i) => i)
  if (n <= 2) return idx
  if (n <= 8) {
    let best = idx
    let bestD = Infinity
    for (const p of permutations(idx)) {
      const d = tripKm(start, end, p.map((i) => pts[i]))
      if (d < bestD) { bestD = d; best = p }
    }
    return best
  }
  const origin = start ?? pts[0]
  const remaining = idx.slice()
  const seed: number[] = []
  let cur: LL = origin
  while (remaining.length) {
    let b = 0, bd = Infinity
    for (let k = 0; k < remaining.length; k++) {
      const d = haversineKm(cur, pts[remaining[k]])
      if (d < bd) { bd = d; b = k }
    }
    const j = remaining.splice(b, 1)[0]
    seed.push(j); cur = pts[j]
  }
  return twoOpt(start, end, seed, pts)
}

export function seqCoords(start: LL | null, end: LL | null, geo: LL[], order: number[]): [number, number][] {
  const ordered = order.map((i) => geo[i])
  const seq = [...(start ? [start] : []), ...ordered, ...(end ? [end] : [])]
  return seq.map((p) => [p.lat, p.lng] as [number, number])
}

const ll = (c: [number, number]) => `${c[0]},${c[1]}`

export function googleMapsHref(coords: [number, number][]): string {
  if (coords.length < 2) return '#'
  const q = new URLSearchParams({ api: '1', travelmode: 'driving', origin: ll(coords[0]), destination: ll(coords[coords.length - 1]) })
  const mids = coords.slice(1, -1).map(ll).join('|')
  let url = `https://www.google.com/maps/dir/?${q.toString()}`
  if (mids) url += `&waypoints=${encodeURIComponent(mids)}`
  return url
}

export function appleMapsHref(coords: [number, number][]): string {
  if (coords.length < 2) return '#'
  return `https://maps.apple.com/?saddr=${ll(coords[0])}&daddr=${coords.slice(1).map(ll).join('+to:')}&dirflg=d`
}
