import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  try {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: capped.map(([lat, lng]) => [lng, lat]) }),
    })
    if (!res.ok) return Response.json({ geometry: null, reason: `ors-${res.status}` })
    const geojson = await res.json()
    const line = geojson?.features?.[0]?.geometry?.coordinates as [number, number][] | undefined
    if (!line) return Response.json({ geometry: null, reason: 'no-geometry' })
    return Response.json({ geometry: line.map(([lng, lat]) => [lat, lng]) })
  } catch {
    return Response.json({ geometry: null, reason: 'fetch-failed' })
  }
}
