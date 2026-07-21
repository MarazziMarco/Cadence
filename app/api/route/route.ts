import { createClient } from '@/lib/supabase/server'
import { createTtlCache } from '@/lib/server/ttl-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cache successful route geometry by waypoint set so repeated map draws of the
// same day don't re-hit ORS Directions (quota) nor re-transmit coordinates.
const routeCache = createTtlCache<{
  geometry: [number, number][]
  durations: number[] | null
  waypoints: number[] | null
}>({ ttlMs: 60 * 60 * 1000, max: 300 })

// Road-following route geometry via OpenRouteService Directions. Keeps the ORS
// key server-side. Input/output coordinates are [lat, lng] (Leaflet order);
// ORS speaks [lng, lat]. On any failure returns { geometry: null } so the map
// falls back to straight lines.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.OPENROUTESERVICE_API_KEY
  if (!key) return Response.json({ geometry: null, reason: 'no-key' })

  let body: any
  try { body = await request.json() } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }) }
  const coords: [number, number][] = Array.isArray(body?.coords) ? body.coords : []
  if (coords.length < 2) return Response.json({ geometry: null, reason: 'too-few' })
  // ORS free tier caps waypoints; keep it safe.
  const capped = coords.slice(0, 50)

  const cacheKey = JSON.stringify(capped)
  const cached = routeCache.get(cacheKey)
  if (cached) return Response.json(cached)

  try {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: capped.map(([lat, lng]) => [lng, lat]) }),
    })
    if (!res.ok) return Response.json({ geometry: null, durations: null, reason: `ors-${res.status}` })
    const geojson = await res.json()
    const feature = geojson?.features?.[0]
    const line = feature?.geometry?.coordinates as [number, number][] | undefined
    if (!line) return Response.json({ geometry: null, durations: null, reason: 'no-geometry' })
    // Per-leg driving time (seconds) between consecutive waypoints.
    const durations = (feature?.properties?.segments ?? [])
      .map((s: any) => Number(s?.duration))
      .filter((n: number) => Number.isFinite(n))
    // Indices into `geometry` where each waypoint sits (to slice the road path
    // into per-leg segments).
    const waypoints = feature?.properties?.way_points as number[] | undefined
    const result = {
      geometry: line.map(([lng, lat]) => [lat, lng]) as [number, number][],
      durations: durations.length ? durations : null,
      waypoints: Array.isArray(waypoints) ? waypoints : null,
    }
    routeCache.set(cacheKey, result)
    return Response.json(result)
  } catch {
    return Response.json({ geometry: null, reason: 'fetch-failed' })
  }
}
