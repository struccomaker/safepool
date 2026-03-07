'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { FeatureCollection, Point } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { GlobeCountrySelection } from '@/components/GlobeScene'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CityPreset {
  city: string
  center: [number, number]
}

const CITY_PRESETS: Record<string, CityPreset> = {
  PH: { city: 'Manila', center: [120.9842, 14.5995] },
  ID: { city: 'Jakarta', center: [106.8456, -6.2088] },
  TH: { city: 'Bangkok', center: [100.5018, 13.7563] },
  NP: { city: 'Kathmandu', center: [85.324, 27.7172] },
  JP: { city: 'Tokyo', center: [139.6503, 35.6762] },
  US: { city: 'San Francisco', center: [-122.4194, 37.7749] },
}

const DAMAGE_OFFSETS = [
  [0.0, 0.0, 0.95],
  [0.06, 0.02, 0.8],
  [-0.05, 0.01, 0.75],
  [0.04, -0.03, 0.68],
  [-0.02, -0.04, 0.62],
  [0.09, -0.02, 0.58],
  [-0.08, 0.03, 0.5],
  [0.03, 0.06, 0.44],
  [-0.06, -0.06, 0.4],
]

const DRILLDOWN_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

function resolveCityPreset(country: GlobeCountrySelection): CityPreset {
  const preset = CITY_PRESETS[country.code.toUpperCase()]
  if (preset) return preset

  return {
    city: `${country.name} Metro`,
    center: [country.center.lng, country.center.lat],
  }
}

interface MapcnDrilldownMapProps {
  country: GlobeCountrySelection
  onExit: () => void
}

export default function MapcnDrilldownMap({ country, onExit }: MapcnDrilldownMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const cityPreset = useMemo(() => resolveCityPreset(country), [country])

  const damageData = useMemo<FeatureCollection<Point, { intensity: number }>>(
    () => ({
      type: 'FeatureCollection',
      features: DAMAGE_OFFSETS.map(([lngOffset, latOffset, intensity], index) => ({
        type: 'Feature',
        id: index,
        properties: { intensity },
        geometry: {
          type: 'Point' as const,
          coordinates: [cityPreset.center[0] + lngOffset, cityPreset.center[1] + latOffset],
        },
      })),
    }),
    [cityPreset.center]
  )

  useEffect(() => {
    let cancelled = false

    const initMap = async () => {
      const maplibregl = (await import('maplibre-gl')).default

      if (cancelled || !mapContainerRef.current) return

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: DRILLDOWN_STYLE_URL,
        center: cityPreset.center,
        zoom: 8.6,
        maxZoom: 14,
        minZoom: 4,
        pitch: 0,
        bearing: 0,
        dragRotate: false,
      })

      mapRef.current = map

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        if (!map.getSource('damage-heat')) {
          map.addSource('damage-heat', {
            type: 'geojson',
            data: damageData,
          })
        }

        map.addLayer({
          id: 'damage-heat-layer',
          type: 'heatmap',
          source: 'damage-heat',
          maxzoom: 14,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 0.55, 11, 1.9],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 16, 11, 38],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 0.35],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0,0,0,0)',
              0.2,
              'rgba(110,110,110,0.3)',
              0.45,
              'rgba(170,170,170,0.55)',
              0.7,
              'rgba(220,220,220,0.75)',
              1,
              'rgba(255,255,255,0.98)',
            ],
          },
        })

        map.addLayer({
          id: 'damage-points-layer',
          type: 'circle',
          source: 'damage-heat',
          minzoom: 9,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 8],
            'circle-color': '#f5f5f5',
            'circle-opacity': 0.85,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#111111',
          },
        })
      })
    }

    initMap()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [cityPreset.center, damageData])

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" ref={mapContainerRef} />

      <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[320px] rounded-xl border border-white/20 bg-black/70 p-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-white/30 text-white/80">
            Drill-down
          </Badge>
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">MapCN + MapLibre</p>
        </div>
        <p className="mt-3 text-base font-semibold text-white">{cityPreset.city}, {country.name}</p>
        <p className="mt-1 text-sm text-white/65">City-level impact intensity with a live damage heatmap overlay.</p>
      </div>

      <div className="absolute bottom-4 left-4 z-20">
        <Button onClick={onExit} variant="secondary">
          Back to Globe
        </Button>
      </div>
    </div>
  )
}
