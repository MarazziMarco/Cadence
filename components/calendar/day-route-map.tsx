'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Route, Navigation } from 'lucide-react'
import { listAppointments } from '@/lib/api/appointments'
import { getBusinessSettings } from '@/lib/api/working-hours'
import { getAlgorithmSettings } from '@/lib/api/scheduler'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MapPoint } from './day-map-canvas'
import {
  type LL, bestOrder, haversineKm, seqCoords, tripKm,
  googleMapsHref, appleMapsHref,
} from './route-utils'

// Leaflet touches `window` on import, so load the canvas only on the client.
const DayMapCanvas = dynamic(() => import('./day-map-canvas'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-muted" />,
})

export type CalendarViewLike = 'day' | 'week' | 'month' | 'agenda'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// All calendar days in [from, to] inclusive (capped, defensive).
function dayList(from: string, to: string): string[] {
  if (!from || !to) return []
  const out: string[] = []
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  for (let i = 0; i < 42 && d <= end; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

function coord(loc: any): LL | null {
  const lat = Number(loc?.latitude), lng = Number(loc?.longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

/**
 * View-only map of ONE day's optimized route (start → appointments → end). The
 * day is chosen by view: the displayed day (day view), a chip in the visible
 * week (week view), or the selected grid day (month view). It only reads and
 * draws — never mutates appointments or calls the Edge Function.
 */
export function DayRouteMap({
  businessId, view, selectedDate, rangeFrom, rangeTo,
}: {
  businessId: string
  view: CalendarViewLike
  selectedDate: string
  rangeFrom: string
  rangeTo: string
}) {
  const { t, locale } = useT()
  const dloc = bcp47(locale)

  // Appointments across the visible range: feeds both the chip defaults and the
  // per-day route (filtered client-side, no extra per-day query).
  const { data: rangeAppts = [] } = useQuery({
    queryKey: ['appointments', businessId, rangeFrom, rangeTo],
    queryFn: () => listAppointments(businessId, rangeFrom, rangeTo),
    enabled: !!businessId && !!rangeFrom && !!rangeTo,
  })
  const { data: settings } = useQuery({
    queryKey: ['business-settings', businessId],
    queryFn: () => getBusinessSettings(businessId),
    enabled: !!businessId,
  })
  const { data: algo } = useQuery({
    queryKey: ['algorithm-settings', businessId],
    queryFn: () => getAlgorithmSettings(businessId),
    enabled: !!businessId,
  })

  const studio: LL | null = settings?.location_latitude != null && settings?.location_longitude != null
    ? { lat: Number(settings.location_latitude), lng: Number(settings.location_longitude) }
    : null
  const start = coord((algo as any)?.metadata?.start_location) ?? studio
  const end = coord((algo as any)?.metadata?.end_location) ?? studio

  // Addressed appointments (studio appts with no coordinates add no legs).
  const addressedByDate = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const a of rangeAppts as any[]) {
      if (a.location_latitude != null && a.location_longitude != null) {
        m.set(a.appointment_date, true)
      }
    }
    return m
  }, [rangeAppts])

  const weekDays = useMemo(
    () => (view === 'week' ? dayList(rangeFrom, rangeTo) : []),
    [view, rangeFrom, rangeTo],
  )

  // Default day for week view: today if visible, else first day with addressed
  // appointments, else the first day of the week.
  const weekDefault = useMemo(() => {
    if (weekDays.length === 0) return ''
    const today = todayStr()
    if (weekDays.includes(today)) return today
    const firstWithAppts = weekDays.find((d) => addressedByDate.get(d))
    return firstWithAppts ?? weekDays[0]
  }, [weekDays, addressedByDate])

  // Week view keeps its own chip selection; reset it when the week changes.
  const [pickedDay, setPickedDay] = useState('')
  useEffect(() => { setPickedDay('') }, [rangeFrom, rangeTo, view])

  // The single day X the map draws, per view.
  const day = view === 'week'
    ? (pickedDay || weekDefault)
    : selectedDate

  const geo = useMemo(() =>
    (rangeAppts as any[])
      .filter((a) => a.appointment_date === day)
      .filter((a) => a.location_latitude != null && a.location_longitude != null)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
      .map((a) => ({
        lat: Number(a.location_latitude),
        lng: Number(a.location_longitude),
        name: a.patients?.full_name || a.patients?.first_name || 'Client',
        time: a.start_time?.slice(0, 5) ?? '',
      })),
    [rangeAppts, day])

  const { points, route, km, legMids, legKm, legIds } = useMemo(() => {
    const empty = { points: [] as MapPoint[], route: [] as [number, number][], km: 0, legMids: [] as [number, number][], legKm: [] as number[], legIds: [] as string[] }
    if (geo.length === 0) return empty
    const order = bestOrder(start, end, geo)
    const ordered = order.map((i) => geo[i])

    const pts: MapPoint[] = []
    if (start) pts.push({ lat: start.lat, lng: start.lng, label: t('map.start'), studio: true })
    ordered.forEach((g, n) => pts.push({ lat: g.lat, lng: g.lng, label: g.name, time: g.time, order: n + 1 }))
    if (end) pts.push({ lat: end.lat, lng: end.lng, label: t('map.end'), studio: true })

    const seq: LL[] = [...(start ? [start] : []), ...ordered, ...(end ? [end] : [])]
    const seqLabels = seq.map((_, idx) => {
      if (start && idx === 0) return 'S'
      if (end && idx === seq.length - 1) return 'E'
      return String(start ? idx : idx + 1)
    })
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
      points: pts, route: routeCoords,
      km: tripKm(start, end, ordered),
      legMids: mids, legKm: kmPer, legIds: ids,
    }
  }, [geo, start, end, t])

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
  const { data: routeData } = useQuery({
    queryKey: ['route-geom', route],
    enabled: route.length >= 2,
    staleTime: 5 * 60_000,
    queryFn: () => fetchRoute(route),
  })

  const legs = legMids.map((_, i) => {
    const secs = routeData?.durations?.[i]
    const minutes = secs != null ? Math.max(1, Math.round(secs / 60)) : Math.max(1, Math.round(legKm[i] / 25 * 60))
    const geom = routeData?.geometry
    const wp = routeData?.waypoints
    const path: [number, number][] = (geom && wp && wp.length === route.length)
      ? geom.slice(wp[i], wp[i + 1] + 1)
      : [route[i], route[i + 1]]
    return { path, minutes, id: legIds[i] ?? '' }
  })

  const dayLabel = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(dloc, { weekday: 'short', day: 'numeric' })

  return (
    <Card className="mt-6 shadow-sm">
      <CardHeader className="gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> {t('map.title')}
          {day && <span className="font-normal text-muted-foreground">· {day}</span>}
        </CardTitle>
        {view === 'week' && weekDays.length > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {weekDays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPickedDay(d)}
                className={cn(
                  'shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  d === day ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
                  addressedByDate.get(d) ? '' : 'text-muted-foreground',
                )}
              >
                {dayLabel(d)}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {geo.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('map.emptyDay')}</p>
        ) : (
          <>
            <DayMapCanvas points={points} legs={legs.map((l) => ({ path: l.path, label: l.id, minutes: l.minutes }))} />
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Route className="h-3.5 w-3.5" /> {t('map.distance', { km: km.toFixed(1) })}
              {!start && !end && <span>· {t('map.noStudio')}</span>}
            </p>
            {legs.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {legs.map((l, i) => (
                  <span key={i}><span className="font-semibold text-primary">{l.id}</span> {l.minutes} min</span>
                ))}
              </div>
            )}
            {route.length >= 2 && (
              <div className="mt-3 flex flex-wrap gap-2">
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
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
