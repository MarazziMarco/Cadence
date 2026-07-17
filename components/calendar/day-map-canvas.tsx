'use client'

import { useEffect, useRef } from 'react'
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export interface RouteLeg {
  mid: [number, number]
  minutes: number
}

// Small travel-time pill sitting on the middle of an arc.
function legIcon(minutes: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="white-space:nowrap;padding:1px 6px;border-radius:9999px;background:#fff;color:#2563eb;font-size:11px;font-weight:700;border:1px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,.25)">${minutes} min</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

// Raw Leaflet (not react-leaflet): the map is created once with an explicit
// cleanup (map.remove()), which is robust to React 18 StrictMode / Fast Refresh
// double-mounts — react-leaflet's MapContainer instead threw "Map container is
// already initialized" on the reused <div>.
export default function DayMapCanvas({ points, route, legs = [] }: { points: MapPoint[]; route: [number, number][]; legs?: RouteLeg[] }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  // create / destroy the map
  useEffect(() => {
    if (!elRef.current) return
    const map = L.map(elRef.current, { scrollWheelZoom: true }).setView([45.4642, 9.19], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // (re)draw markers + route whenever the data changes
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    if (route.length >= 2) {
      L.polyline(route, { color: '#2563eb', weight: 4, opacity: 0.85 }).addTo(layer)
    }
    for (const leg of legs) {
      L.marker(leg.mid, { icon: legIcon(leg.minutes), interactive: false, keyboard: false }).addTo(layer)
    }
    for (const p of points) {
      L.marker([p.lat, p.lng], { icon: pin(p) })
        .addTo(layer)
        .bindTooltip(`<b>${escapeHtml(p.label)}</b>${p.time ? ` · ${escapeHtml(p.time)}` : ''}`, {
          direction: 'top',
          offset: [0, -14],
        })
    }
    if (points.length) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: 15,
      })
    }
  }, [points, route, legs])

  return <div ref={elRef} style={{ height: 360, width: '100%', borderRadius: 12 }} />
}
