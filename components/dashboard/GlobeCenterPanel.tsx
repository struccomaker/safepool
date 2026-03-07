'use client'

import { Suspense, lazy, useEffect, useState } from 'react'
import type { GlobeCountrySelection } from '@/components/GlobeScene'
import MapcnDrilldownMap from '@/components/dashboard/MapcnDrilldownMap'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

const GlobeScene = lazy(() => import('@/components/GlobeScene'))

interface GlobeCenterPanelProps {
  onDrilldownChange?: (isOpen: boolean) => void
}

function GlobeLoadingFallback() {
  const [progress, setProgress] = useState(12)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return 92
        return current + 6
      })
    }, 240)

    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/70">
      <div className="w-[320px] rounded-xl border border-white/20 bg-black/80 p-5 backdrop-blur">
        <p className="mb-3 text-sm text-white/75">Loading global relief map...</p>
        <Progress value={progress} />
      </div>
    </div>
  )
}

export default function GlobeCenterPanel({ onDrilldownChange }: GlobeCenterPanelProps) {
  const [selectedCountry, setSelectedCountry] = useState<GlobeCountrySelection | null>(null)

  const isDrilldownOpen = selectedCountry !== null

  useEffect(() => {
    onDrilldownChange?.(isDrilldownOpen)
  }, [isDrilldownOpen, onDrilldownChange])

  return (
    <section className="absolute inset-0 overflow-hidden bg-black">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.82)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2">
        <Badge variant="outline" className="border-white/30 bg-black/40 px-4 py-1 text-white/85 backdrop-blur">
          {isDrilldownOpen ? 'City Drill-down · Damage Heatmap' : 'Emergency Response Globe · Hover + Click Countries'}
        </Badge>
      </div>
      <div className="h-full w-full">
        {isDrilldownOpen && selectedCountry ? (
          <MapcnDrilldownMap country={selectedCountry} onExit={() => setSelectedCountry(null)} />
        ) : (
          <Suspense fallback={<GlobeLoadingFallback />}>
            <GlobeScene
              activeCountryCode={null}
              className="h-full w-full"
              monochrome
              onCountryDrilldown={setSelectedCountry}
            />
          </Suspense>
        )}
      </div>
    </section>
  )
}
