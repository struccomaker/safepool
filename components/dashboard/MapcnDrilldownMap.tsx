'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, Polygon } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { GlobeCountrySelection } from '@/components/GlobeScene'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CityPreset {
  city:   string
  center: [number, number]
}

const CITY_PRESETS: Record<string, CityPreset> = {
  PH: { city: 'Manila',        center: [120.9842,  14.5995] },
  ID: { city: 'Jakarta',       center: [106.8456,  -6.2088] },
  TH: { city: 'Bangkok',       center: [100.5018,  13.7563] },
  NP: { city: 'Kathmandu',     center: [ 85.3240,  27.7172] },
  JP: { city: 'Tokyo',         center: [139.6503,  35.6762] },
  US: { city: 'San Francisco', center: [-122.4194,  37.7749] },
}

// [radiusDeg, fillHex, fillOpacity, strokeOpacity]
const DAMAGE_RINGS: [number, string, number, number][] = [
  [0.22,  '#fbbf24', 0.04, 0.15],
  [0.13,  '#f97316', 0.06, 0.20],
  [0.07,  '#ef4444', 0.10, 0.25],
  [0.030, '#dc2626', 0.16, 0.32],
  [0.010, '#fecdd3', 0.22, 0.40],
]

const DRILLDOWN_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

function resolveCityPreset(country: GlobeCountrySelection): CityPreset {
  const preset = CITY_PRESETS[country.code.toUpperCase()]
  if (preset) return preset
  return { city: `${country.name} Metro`, center: [country.center.lng, country.center.lat] }
}

function buildDamageRings(center: [number, number]): FeatureCollection<Polygon, { ring: number }> {
  const STEPS = 72
  const circle = (r: number): [number, number][] => {
    const pts = Array.from({ length: STEPS }, (_, i) => {
      const a = (i / STEPS) * 2 * Math.PI
      return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)] as [number, number]
    })
    pts.push(pts[0])
    return pts
  }
  return {
    type: 'FeatureCollection',
    features: DAMAGE_RINGS.map(([r], ring) => ({
      type:       'Feature' as const,
      id:          ring,
      properties:  { ring },
      geometry: { type: 'Polygon' as const, coordinates: [circle(r)] },
    })),
  }
}

interface MapcnDrilldownMapProps {
  country: GlobeCountrySelection
  onExit:  () => void
}

export default function MapcnDrilldownMap({ country, onExit }: MapcnDrilldownMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<MapLibreMap | null>(null)
  const pulseRafRef     = useRef<number | null>(null)
  const cityPreset      = useMemo(() => resolveCityPreset(country), [country])
  const [ready, setReady] = useState(false)

  const damageRingsData = useMemo(() => buildDamageRings(cityPreset.center), [cityPreset.center])

  const startPulse = useCallback((map: MapLibreMap) => {
    const PERIOD = 1600
    const t0 = performance.now()
    function tick(now: number) {
      const t       = ((now - t0) % PERIOD) / PERIOD
      const radius  = 8 + t * 38
      const opacity = 1 - t
      if (map.getLayer('epicentre-pulse')) {
        map.setPaintProperty('epicentre-pulse', 'circle-radius',         radius)
        map.setPaintProperty('epicentre-pulse', 'circle-stroke-opacity', opacity)
      }
      pulseRafRef.current = requestAnimationFrame(tick)
    }
    pulseRafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    let cancelled = false

    const initMap = async () => {
      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled || !mapContainerRef.current) return

      const map = new maplibregl.Map({
        container:  mapContainerRef.current,
        style:      DRILLDOWN_STYLE_URL,
        center:     cityPreset.center,
        zoom:       8.6,
        maxZoom:    17,
        minZoom:    4,
        pitch:      0,
        bearing:    0,
        dragRotate: false,
      })

      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        if (cancelled) return

        // Damage rings (outer → inner)
        map.addSource('damage-rings', { type: 'geojson', data: damageRingsData })
        DAMAGE_RINGS.forEach(([, fillColor, fillOpacity, strokeOpacity], ringIndex) => {
          map.addLayer({
            id:     `damage-ring-${ringIndex}`,
            type:   'fill',
            source: 'damage-rings',
            filter: ['==', ['get', 'ring'], ringIndex],
            paint:  { 'fill-color': fillColor, 'fill-opacity': fillOpacity },
          })
          map.addLayer({
            id:     `damage-ring-stroke-${ringIndex}`,
            type:   'line',
            source: 'damage-rings',
            filter: ['==', ['get', 'ring'], ringIndex],
            paint:  { 'line-color': fillColor, 'line-opacity': strokeOpacity, 'line-width': 1, 'line-blur': 1.5 },
          })
        })

        // Epicentre pulse + dot
        map.addSource('epicentre', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Point', coordinates: cityPreset.center }, properties: {} },
        })
        map.addLayer({
          id:     'epicentre-pulse',
          type:   'circle',
          source: 'epicentre',
          paint: {
            'circle-radius':          8,
            'circle-color':           'rgba(0,0,0,0)',
            'circle-opacity':         0,
            'circle-stroke-width':    2.5,
            'circle-stroke-color':    '#ef4444',
            'circle-stroke-opacity':  1,
            'circle-pitch-alignment': 'map',
          },
        })
        map.addLayer({
          id:     'epicentre-dot',
          type:   'circle',
          source: 'epicentre',
          paint: {
            'circle-radius':          5,
            'circle-color':           '#ffffff',
            'circle-stroke-width':    2,
            'circle-stroke-color':    '#ef4444',
            'circle-pitch-alignment': 'map',
          },
        })

        setReady(true)
        startPulse(map)
      })
    }

    initMap()

    return () => {
      cancelled = true
      if (pulseRafRef.current !== null) cancelAnimationFrame(pulseRafRef.current)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [cityPreset.center, damageRingsData, startPulse])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="h-full w-full" ref={mapContainerRef} />

      <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[300px] rounded-xl border border-white/20 bg-black/75 p-4 backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="outline" className="border-white/30 text-white/80">Drill-down</Badge>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">MapLibre</p>
        </div>
        <p className="text-base font-semibold text-white">{cityPreset.city}, {country.name}</p>
        <p className="mt-1 text-sm text-white/65">
          {ready ? 'City-level damage heatmap' : 'Loading city data…'}
        </p>
      </div>

      <div className="absolute bottom-4 left-4 z-20">
        <Button onClick={onExit} variant="secondary">Back to Globe</Button>
      </div>
    </div>
  )
}
