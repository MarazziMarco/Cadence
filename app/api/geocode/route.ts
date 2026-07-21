import { createClient } from '@/lib/supabase/server'
import { createTtlCache } from '@/lib/server/ttl-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cache successful geocodes so repeated "Set address" / map draws don't re-hit
// ORS (quota) and don't re-transmit the same address externally.
const geocodeCache = createTtlCache<{ latitude: number; longitude: number }>({
  ttlMs: 24 * 60 * 60 * 1000,
  max: 500,
})

// Address -> coordinates via OpenRouteService geocoding (Pelias). Keeps the ORS
// key server-side. Returns { latitude, longitude } or { latitude: null } on any
// failure so the caller can fall back to the studio. Used by Settings to resolve
// the optimizer's day start/end points (spec §1/§4).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.OPENROUTESERVICE_API_KEY
  if (!key) return Response.json({ latitude: null, longitude: null, reason: 'no-key' })

  let body: any
  try { body = await request.json() } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }) }
  const address = typeof body?.address === 'string' ? body.address.trim() : ''
  if (!address) return Response.json({ latitude: null, longitude: null, reason: 'empty' })

  const cacheKey = address.toLowerCase()
  const cached = geocodeCache.get(cacheKey)
  if (cached) return Response.json(cached)

  try {
    const res = await fetch(
      `https://api.openrouteservice.org/geocode/search?text=${encodeURIComponent(address)}&size=1`,
      { headers: { Authorization: key } },
    )
    if (!res.ok) return Response.json({ latitude: null, longitude: null, reason: `ors-${res.status}` })
    const geojson = await res.json()
    const coords = geojson?.features?.[0]?.geometry?.coordinates as [number, number] | undefined
    if (!coords) return Response.json({ latitude: null, longitude: null, reason: 'no-result' })
    const [lng, lat] = coords
    const result = { latitude: lat, longitude: lng }
    geocodeCache.set(cacheKey, result)
    return Response.json(result)
  } catch {
    return Response.json({ latitude: null, longitude: null, reason: 'fetch-failed' })
  }
}
