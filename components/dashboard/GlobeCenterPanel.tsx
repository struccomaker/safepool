'use client'

import { lazy, useEffect, useState } from 'react'
import type { GlobeCountrySelection } from '@/components/GlobeScene'
import MapcnDrilldownMap from '@/components/dashboard/MapcnDrilldownMap'
import { Badge } from '@/components/ui/badge'

const GlobeScene = lazy(() => import('@/components/GlobeScene'))

interface GlobeCenterPanelProps {
  onDrilldownChange?: (isOpen: boolean) => void
  onGlobeReadyChange?: (isReady: boolean) => void
}

export default function GlobeCenterPanel({ onDrilldownChange, onGlobeReadyChange }: GlobeCenterPanelProps) {
  const [selectedCountry, setSelectedCountry] = useState<GlobeCountrySelection | null>(null)

  const isDrilldownOpen = selectedCountry !== null

  useEffect(() => {
    onDrilldownChange?.(isDrilldownOpen)
  }, [isDrilldownOpen, onDrilldownChange])

  // Preload maplibre-gl module + tile style after globe mounts so the
  // drilldown map appears instantly when the user clicks a country.
  useEffect(() => {
    const timer = setTimeout(() => {
      import('maplibre-gl').catch(() => {})
      fetch('https://tiles.openfreemap.org/styles/dark', { cache: 'force-cache' }).catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section className="absolute inset-0 overflow-hidden bg-black">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.82)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2">
        <Badge variant="outline" className="border-white/30 bg-black/40 px-4 py-1 text-white/85 backdrop-blur">
          {isDrilldownOpen ? 'City Drill-down · Damage Heatmap' : 'SAFEPOOL'}
        </Badge>
      </div>
      <div className="h-full w-full">
        {isDrilldownOpen && selectedCountry ? (
          <MapcnDrilldownMap country={selectedCountry} onExit={() => setSelectedCountry(null)} />
        ) : (
          <GlobeScene
            activeCountryCode={null}
            className="h-full w-full"
            monochrome
            onCountryDrilldown={setSelectedCountry}
            onGlobeReady={() => onGlobeReadyChange?.(true)}
          />
        )}
      </div>
    </section>
  )
}
