'use client'

import { useEffect } from 'react'
import type { DisasterEvent } from '@/types'

interface DisasterMapProps {
  disasters: DisasterEvent[]
}

const SEVERITY_COLOR: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
}

// Leaflet must be loaded client-side only
export default function DisasterMap({ disasters }: DisasterMapProps) {
  useEffect(() => {
    // Dynamically import Leaflet to avoid SSR issues
    Promise.all([
      import('leaflet'),
      import('react-leaflet'),
    ]).then(([L]) => {
      // Fix Leaflet default icon paths (broken by webpack)
      // @ts-expect-error _getIconUrl is internal
      delete L.default.Icon.Default.prototype._getIconUrl
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
    })
  }, [])

  // Render a placeholder until we wire up the full Leaflet map component
  // TODO: swap for <MapContainer> from react-leaflet with CircleMarker per disaster
  return (
    <div
      className="w-full h-full flex items-center justify-center bg-[#0a0f1e] text-white/20 text-sm"
      style={{ minHeight: 300 }}
    >
      <div className="text-center">
        <div className="text-4xl mb-2">🗺️</div>
        <div>Disaster Map — {disasters.length} events</div>
        <div className="mt-2 flex flex-wrap gap-2 justify-center">
          {Object.entries(SEVERITY_COLOR).map(([level, color]) => (
            <span key={level} className="flex items-center gap-1 text-xs">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
              {level}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
