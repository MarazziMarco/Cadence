'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Route, Wand2, Navigation } from 'lucide-react'
import { listAppointments } from '@/lib/api/appointments'
import { getBusinessSettings } from '@/lib/api/working-hours'
import { useT } from '@/lib/i18n/use-t'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { OptimizeDialog } from './optimize-dialog'
import type { MapPoint } from './day-map-canvas'

// Leaflet touches `window` on import, so load the canvas only on the client.
const DayMapCanvas = dynamic(() => import('./day-map-canvas'), {
  ssr: false,
  loading: () => <div className="h-[360px] w-full animate-pulse rounded-xl bg-muted" />,
})

interface DayAppt {
  id: string
  start_time: string
  location_latitude?: number | null
  location_longitude?: number | null
  patients?: { full_name?: string | null; first_name?: string | null } | null
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

type LL = { lat: number; lng: number }

// Total length of studio -> stops (in order) -> studio (open path if no studio).
function tripKm(studio: LL | null, stops: LL[]): number {
  const seq = studio ? [studio, ...stops, studio] : stops
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

// 2-opt local search (removes crossings) for larger stop counts.
function twoOpt(studio: LL | null, order: number[], pts: LL[]): number[] {
  let best = order
  let bestD = tripKm(studio, best.map((i) => pts[i]))
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)]
        const d = tripKm(studio, cand.map((j) => pts[j]))
        if (d < bestD - 1e-9) { best = cand; bestD = d; improved = true }
      }
    }
  }
  return best
}

// Shortest visiting order. Exact (all permutations) for few stops, else
// nearest-neighbour seeded 2-opt. Guarantees distance <= the current order.
function bestOrder(studio: LL | null, pts: LL[]): number[] {
  const n = pts.length
  const idx = pts.map((_, i) => i)
  if (n <= 2) return idx
  if (n <= 8) {
    let best = idx
    let bestD = Infinity
    for (const p of permutations(idx)) {
      const d = tripKm(studio, p.map((i) => pts[i]))
      if (d < bestD) { bestD = d; best = p }
    }
    return best
  }
  // nearest-neighbour seed
  const start = studio ?? pts[0]
  const remaining = idx.slice()
  const seed: number[] = []
  let cur: LL = start
  while (remaining.length) {
    let b = 0, bd = Infinity
    for (let k = 0; k < remaining.length; k++) {
      const d = haversineKm(cur, pts[remaining[k]])
      if (d < bd) { bd = d; b = k }
    }
    const j = remaining.splice(b, 1)[0]
    seed.push(j); cur = pts[j]
  }
  return twoOpt(studio, seed, pts)
}

// Full waypoint coords (studio -> stops in `order` -> studio) for one ordering.
function seqCoords(studio: LL | null, geo: LL[], order: number[]): [number, number][] {
  const ordered = order.map((i) => geo[i])
  const seq = [...(studio ? [studio] : []), ...ordered, ...(studio ? [studio] : [])]
  return seq.map((p) => [p.lat, p.lng] as [number, number])
}

const ll = (c: [number, number]) => `${c[0]},${c[1]}`

// Google Maps directions with all stops as waypoints (opens the native app on phones).
function googleMapsHref(coords: [number, number][]): string {
  if (coords.length < 2) return '#'
  const q = new URLSearchParams({ api: '1', travelmode: 'driving', origin: ll(coords[0]), destination: ll(coords[coords.length - 1]) })
  const mids = coords.slice(1, -1).map(ll).join('|')
  let url = `https://www.google.com/maps/dir/?${q.toString()}`
  if (mids) url += `&waypoints=${encodeURIComponent(mids)}`
  return url
}

// Apple Maps (no multi-stop via URL): route from the studio to the ordered stops.
function appleMapsHref(coords: [number, number][]): string {
  if (coords.length < 2) return '#'
  return `https://maps.apple.com/?saddr=${ll(coords[0])}&daddr=${coords.slice(1).map(ll).join('+to:')}&dirflg=d`
}

export function DayMap({ businessId, date }: { businessId: string; date: string }) {
  const { t } = useT()
  const [mode, setMode] = useState<'before' | 'after'>('after')
  const [optimizeOpen, setOptimizeOpen] = useState(false)

  // Opens the real optimizer for this day. The solver now minimises travel as
  // part of its objective (spec §2), so there is no separate "route" mode — a
  // single optimize covers session + travel + idle + constraints.
  function optimizeDay() {
    setOptimizeOpen(true)
  }

  const { data: appts = [] } = useQuery({
    queryKey: ['appointments', businessId, date, date],
    queryFn: () => listAppointments(businessId, date, date),
    enabled: !!businessId && !!date,
  })

  const { data: settings } = useQuery({
    queryKey: ['business-settings', businessId],
    queryFn: () => getBusinessSettings(businessId),
    enabled: !!businessId,
  })

  const geo = useMemo(() =>
    [...appts]
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
      .filter((a) => a.location_latitude != null && a.location_longitude != null)
      .map((a) => ({
        lat: Number(a.location_latitude),
        lng: Number(a.location_longitude),
        name: a.patients?.full_name || a.patients?.first_name || 'Client',
        time: a.start_time?.slice(0, 5) ?? '',
      })),
    [appts])

  const studio = settings?.location_latitude != null && settings?.location_longitude != null
    ? { lat: Number(settings.location_latitude), lng: Number(settings.location_longitude) }
    : null

  const { points, route, km, kmBefore, kmAfter, legMids, legKm, legIds, beforeCoords, afterCoords } = useMemo(() => {
    const empty = { points: [] as MapPoint[], route: [] as [number, number][], km: 0, kmBefore: 0, kmAfter: 0, legMids: [] as [number, number][], legKm: [] as number[], legIds: [] as string[], beforeCoords: [] as [number, number][], afterCoords: [] as [number, number][] }
    if (geo.length === 0) return empty
    const beforeOrder = geo.map((_, i) => i) // already time-sorted upstream
    const afterOrder = bestOrder(studio, geo)
    const order = mode === 'before' ? beforeOrder : afterOrder
    const ordered = order.map((i) => geo[i])
    // The day keeps its time slots; on the optimized order they are reassigned to
    // the new visiting sequence, so labels show the times AFTER optimization.
    const times = geo.map((g) => g.time)

    const pts: MapPoint[] = []
    if (studio) pts.push({ lat: studio.lat, lng: studio.lng, label: t('map.studio'), studio: true })
    ordered.forEach((g, n) => pts.push({ lat: g.lat, lng: g.lng, label: g.name, time: times[n] ?? g.time, order: n + 1 }))

    const seq = [...(studio ? [studio] : []), ...ordered, ...(studio ? [studio] : [])]
    // Label each seq position: 'S' for the studio, otherwise the visit number.
    const seqLabels = seq.map((_, idx) =>
      (studio && (idx === 0 || idx === seq.length - 1)) ? 'S' : String(studio ? idx : idx + 1))
    const routeCoords = seq.map((p) => [p.lat, p.lng] as [number, number])
    const mids: [number, number][] = []
    const kmPer: number[] = []
    const ids: string[] = []
    for (let i = 0; i < seq.length - 1; i++) {
      mids.push([(seq[i].lat + seq[i + 1].lat) / 2, (seq[i].lng + seq[i + 1].lng) / 2])
      kmPer.push(haversineKm(seq[i], seq[i + 1]))
      ids.push(`${seqLabels[i]}-${seqLabels[i + 1]}`)
    }
    return {
      points: pts,
      route: routeCoords,
      km: kmPer.reduce((a, b) => a + b, 0),
      kmBefore: tripKm(studio, beforeOrder.map((i) => geo[i])),
      kmAfter: tripKm(studio, afterOrder.map((i) => geo[i])),
      legMids: mids,
      legKm: kmPer,
      legIds: ids,
      beforeCoords: seqCoords(studio, geo, beforeOrder),
      afterCoords: seqCoords(studio, geo, afterOrder),
    }
  }, [geo, studio, mode, t])

  // Real road geometry + per-leg travel time (ORS) for both orders, so we can
  // show time saved and always have the drawn order's data.
  async function fetchRoute(coords: [number, number][]) {
    const res = await fetch('/api/route', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ coords }),
    })
    const json = await res.json().catch(() => null)
    return {
      geometry: (json?.geometry as [number, number][] | null) ?? null,
      durations: (json?.durations as number[] | null) ?? null,
      waypoints: (json?.waypoints as number[] | null) ?? null,
    }
  }
  const { data: beforeData } = useQuery({ queryKey: ['route-geom', beforeCoords], enabled: beforeCoords.length >= 2, staleTime: 5 * 60_000, queryFn: () => fetchRoute(beforeCoords) })
  const { data: afterData } = useQuery({ queryKey: ['route-geom', afterCoords], enabled: afterCoords.length >= 2, staleTime: 5 * 60_000, queryFn: () => fetchRoute(afterCoords) })
  const displayed = mode === 'before' ? beforeData : afterData

  // One polyline per leg (sliced from the road geometry when available, else a
  // straight segment) so hovering a leg shows its travel time.
  const legs = legMids.map((_, i) => {
    const secs = displayed?.durations?.[i]
    const minutes = secs != null ? Math.max(1, Math.round(secs / 60)) : Math.max(1, Math.round(legKm[i] / 25 * 60))
    const geom = displayed?.geometry
    const wp = displayed?.waypoints
    const path: [number, number][] = (geom && wp && wp.length === route.length)
      ? geom.slice(wp[i], wp[i + 1] + 1)
      : [route[i], route[i + 1]]
    return { path, minutes, id: legIds[i] ?? '' }
  })

  // Total travel time each order (real ORS, else estimate at ~25 km/h).
  const minutesOf = (data: typeof beforeData, kmFallback: number) =>
    data?.durations ? Math.round(data.durations.reduce((a, b) => a + b, 0) / 60) : Math.round(kmFallback / 25 * 60)
  const timeSaved = Math.max(0, minutesOf(beforeData, kmBefore) - minutesOf(afterData, kmAfter))

  return (
    <Card className="mt-6 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" /> {t('map.title')} <span className="font-normal text-muted-foreground">· {date}</span></CardTitle>
        {geo.length > 0 && (
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(['before', 'after'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {t(m === 'before' ? 'map.before' : 'map.after')}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {geo.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('map.empty')}</p>
        ) : (
          <>
            <DayMapCanvas points={points} legs={legs.map((l) => ({ path: l.path, label: l.id, minutes: l.minutes }))} />
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Route className="h-3.5 w-3.5" /> {t('map.distance', { km: km.toFixed(1) })}
              {mode === 'after' && kmBefore > kmAfter + 0.05 && (
                <span className="font-medium text-success">· {t('map.saved', { km: (kmBefore - kmAfter).toFixed(1) })}{timeSaved > 0 ? ` · ${t('map.savedTime', { min: timeSaved })}` : ''}</span>
              )}
              {mode === 'after' && kmBefore <= kmAfter + 0.05 && (
                <span>· {t('map.noGain')}</span>
              )}
              {mode === 'before' && <span className="text-muted-foreground">· {t('map.beforeHint', { km: kmAfter.toFixed(1) })}</span>}
              {!studio && <span>· {t('map.noStudio')}</span>}
            </p>
            {legs.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {legs.map((l, i) => (
                  <span key={i}><span className="font-semibold text-primary">{l.id}</span> {l.minutes} min</span>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={optimizeDay} disabled={!businessId}>
                <Wand2 className="mr-1.5 h-4 w-4" /> {t('map.optimizeDay')}
              </Button>
              {route.length >= 2 && (
                <>
                  <Button asChild size="sm" variant="outline">
                    <a href={googleMapsHref(route)} target="_blank" rel="noopener noreferrer">
                      <Navigation className="mr-1.5 h-4 w-4" /> {t('map.openGoogle')}
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={appleMapsHref(route)} target="_blank" rel="noopener noreferrer">
                      <Navigation className="mr-1.5 h-4 w-4" /> {t('map.openApple')}
                    </a>
                  </Button>
                </>
              )}
            </div>
            <OptimizeDialog
              businessId={businessId}
              dateFrom={date}
              dateTo={date}
              open={optimizeOpen}
              onOpenChange={setOptimizeOpen}
              showTrigger={false}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
