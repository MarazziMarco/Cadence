'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Route } from 'lucide-react'
import { listAppointments } from '@/lib/api/appointments'
import { getBusinessSettings } from '@/lib/api/working-hours'
import { useT } from '@/lib/i18n/use-t'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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

// Nearest-neighbour order starting from the studio (a light geographic proxy for
// the "route-optimized" order).
function nearestOrder(start: { lat: number; lng: number }, stops: { lat: number; lng: number; i: number }[]): number[] {
  const remaining = [...stops]
  const order: number[] = []
  let cur = start
  while (remaining.length) {
    let best = 0
    let bestD = Infinity
    for (let k = 0; k < remaining.length; k++) {
      const d = haversineKm(cur, remaining[k])
      if (d < bestD) { bestD = d; best = k }
    }
    const next = remaining.splice(best, 1)[0]
    order.push(next.i)
    cur = next
  }
  return order
}

export function DayMap({ businessId, date }: { businessId: string; date: string }) {
  const { t } = useT()
  const [mode, setMode] = useState<'before' | 'after'>('after')

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

  const { points, route, km } = useMemo(() => {
    if (geo.length === 0) return { points: [] as MapPoint[], route: [] as [number, number][], km: 0 }
    const idx = geo.map((_, i) => i)
    const order = mode === 'before'
      ? idx // already time-sorted upstream
      : studio
        ? nearestOrder(studio, geo.map((g, i) => ({ ...g, i })))
        : idx
    const ordered = order.map((i) => geo[i])

    const pts: MapPoint[] = []
    if (studio) pts.push({ lat: studio.lat, lng: studio.lng, label: t('map.studio'), studio: true })
    ordered.forEach((g, n) => pts.push({ lat: g.lat, lng: g.lng, label: g.name, time: g.time, order: n + 1 }))

    const seq = [
      ...(studio ? [studio] : []),
      ...ordered,
      ...(studio ? [studio] : []),
    ]
    const routeCoords = seq.map((p) => [p.lat, p.lng] as [number, number])
    let total = 0
    for (let i = 1; i < seq.length; i++) total += haversineKm(seq[i - 1], seq[i])
    return { points: pts, route: routeCoords, km: total }
  }, [geo, studio, mode, t])

  // Ask the server for the real road geometry (ORS); fall back to straight lines.
  const { data: roadGeometry } = useQuery({
    queryKey: ['route-geom', route],
    enabled: route.length >= 2,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/route', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coords: route }),
      })
      const json = await res.json().catch(() => null)
      return (json?.geometry as [number, number][] | null) ?? null
    },
  })
  const drawnRoute = roadGeometry && roadGeometry.length >= 2 ? roadGeometry : route

  return (
    <Card className="mt-6 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" /> {t('map.title')}</CardTitle>
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
            <DayMapCanvas points={points} route={drawnRoute} />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Route className="h-3.5 w-3.5" /> {t('map.distance', { km: km.toFixed(1) })}
              {!studio && <span>· {t('map.noStudio')}</span>}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
