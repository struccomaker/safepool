'use client'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { DisasterEvent } from '@/types'

const severityColor: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
}

export default function DisasterMapInner({ events }: { events: DisasterEvent[] }) {
  return (
    <MapContainer
      center={[10, 115]}
      zoom={3}
      className="w-full h-[400px] rounded-xl"
      style={{ background: '#0a0a14' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com">CARTO</a>'
      />
      {events.map((ev) => (
        <CircleMarker
          key={ev.id}
          center={[ev.location_lat, ev.location_lon]}
          radius={Math.max(5, (ev.magnitude ?? 3) * 2)}
          pathOptions={{
            color: severityColor[ev.severity] ?? '#f59e0b',
            fillColor: severityColor[ev.severity] ?? '#f59e0b',
            fillOpacity: 0.5,
            weight: 1.5,
          }}
        >
          <Popup>
            <div className="text-xs">
              <strong className="capitalize">{ev.disaster_type}</strong> — M{ev.magnitude}<br />
              {ev.location_name}<br />
              <span className="capitalize" style={{ color: severityColor[ev.severity] }}>{ev.severity}</span>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
