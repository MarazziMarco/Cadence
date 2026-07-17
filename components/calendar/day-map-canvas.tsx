'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPoint {
  lat: number
  lng: number
  label: string // patient name (or "Studio")
  time?: string // HH:MM
  order?: number // 1-based stop number along the route
  studio?: boolean
}

// Numbered circular pin, drawn as HTML so we ship no image assets.
function pin(p: MapPoint): L.DivIcon {
  const bg = p.studio ? '#0f172a' : '#4f46e5'
  const inner = p.studio ? '★' : String(p.order ?? '')
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${bg};color:#fff;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff">${inner}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }, [map, points])
  return null
}

export default function DayMapCanvas({ points, route }: { points: MapPoint[]; route: [number, number][] }) {
  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lng]
    : [45.4642, 9.19] // Milan fallback
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: 360, width: '100%', borderRadius: 12 }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {route.length >= 2 && (
        <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }} />
      )}
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={pin(p)}>
          <Tooltip direction="top" offset={[0, -14]} opacity={1}>
            <span style={{ fontWeight: 600 }}>{p.label}</span>{p.time ? ` · ${p.time}` : ''}
          </Tooltip>
        </Marker>
      ))}
      <FitBounds points={points} />
    </MapContainer>
  )
}
