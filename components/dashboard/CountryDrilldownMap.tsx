'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, Polygon } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { GlobeCountrySelection } from '@/components/GlobeScene'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DISASTER_PINS } from '@/lib/disaster-pins'

// Re-shape shared pins into the format this component expects
const GLOBAL_DISASTERS = DISASTER_PINS.map((p) => ({
  id:       p.id,
  label:    p.label,
  location: p.location,
  coords:   p.coords,   // [lng, lat] — GeoJSON order
  dotColor: p.dotColor,
  rings:    p.rings2d,
}))

// Initial zoom per clicked country — zooms in on the relevant disaster
const COUNTRY_ZOOM: Record<string, number> = {
  PH: 8.6, ID: 8.6, TH: 8.6, NP: 8.6, JP: 8.6, US: 8.6,
}

const DRILLDOWN_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildRings(
  center: [number, number],
  rings:  [number, string, number, number][]
): FeatureCollection<Polygon, { ring: number }> {
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
    features: rings.map(([r], ring) => ({
      type:       'Feature' as const,
      id:          ring,
      properties:  { ring },
      geometry: { type: 'Polygon' as const, coordinates: [circle(r)] },
    })),
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface CountryDrilldownMapProps {
  country: GlobeCountrySelection
  onExit:  () => void
}

export default function CountryDrilldownMap({ country, onExit }: CountryDrilldownMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<MapLibreMap | null>(null)
  const pulseRafRef     = useRef<number | null>(null)
  const [ready, setReady] = useState(false)

  const initialCenter = useMemo((): [number, number] => {
    // Snap to the closest disaster in GLOBAL_DISASTERS for the clicked country
    const code = country.code.toUpperCase()
    const snapMap: Record<string, string> = {
      PH: 'manila-eq', ID: 'jakarta-flood', TH: 'bangkok-flood', NP: 'kathmandu-eq',
    }
    const snapped = GLOBAL_DISASTERS.find(d => d.id === snapMap[code])
    return snapped?.coords ?? [country.center.lng, country.center.lat]
  }, [country])

  const initialZoom = COUNTRY_ZOOM[country.code.toUpperCase()] ?? 8.6

  // Pulse all disaster epicentres, staggered by PERIOD/n
  const startPulse = useCallback((map: MapLibreMap) => {
    const PERIOD = 1600
    const t0     = performance.now()
    const count  = GLOBAL_DISASTERS.length

    function tick(now: number) {
      const elapsed = Math.max(0, now - t0)
      GLOBAL_DISASTERS.forEach((d, i) => {
        const offset  = (i / count) * PERIOD
        const t       = ((elapsed + offset) % PERIOD) / PERIOD
        const radius  = 8 + t * 38
        const opacity = Math.min(1, Math.max(0, 1 - t))
        const layerId = `pulse-${d.id}`
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'circle-radius',         radius)
          map.setPaintProperty(layerId, 'circle-stroke-opacity', opacity)
        }
      })
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
        container:          mapContainerRef.current,
        style:              DRILLDOWN_STYLE_URL,
        center:             initialCenter,
        zoom:               initialZoom,
        minZoom:            2,
        maxZoom:            17,
        pitch:              0,
        bearing:            0,
        dragRotate:         false,
        attributionControl: false,
      })

      mapRef.current = map
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      const enforceCompactAttribution = () => {
        const attributionElement = map.getContainer().querySelector('.maplibregl-ctrl-attrib')
        if (!attributionElement) return

        attributionElement.classList.add('maplibregl-compact')
        attributionElement.classList.remove('maplibregl-compact-show')
      }

      window.setTimeout(enforceCompactAttribution, 0)

      map.on('load', () => {
        if (cancelled) return

        enforceCompactAttribution()

        // Plot every disaster: rings + pulse dot
        GLOBAL_DISASTERS.forEach(disaster => {
          const ringsGeo = buildRings(disaster.coords, disaster.rings)

          // Ring fills + strokes (outer → inner)
          map.addSource(`rings-${disaster.id}`, { type: 'geojson', data: ringsGeo })
          disaster.rings.forEach(([, fillColor, fillOpacity, strokeOpacity], i) => {
            map.addLayer({
              id:     `ring-${disaster.id}-${i}`,
              type:   'fill',
              source: `rings-${disaster.id}`,
              filter: ['==', ['get', 'ring'], i],
              paint:  { 'fill-color': fillColor, 'fill-opacity': fillOpacity },
            })
            map.addLayer({
              id:     `ring-stroke-${disaster.id}-${i}`,
              type:   'line',
              source: `rings-${disaster.id}`,
              filter: ['==', ['get', 'ring'], i],
              paint:  {
                'line-color':   fillColor,
                'line-opacity': strokeOpacity,
                'line-width':   1,
                'line-blur':    1.5,
              },
            })
          })

          // Epicentre source
          map.addSource(`epi-${disaster.id}`, {
            type: 'geojson',
            data: {
              type:       'Feature',
              geometry:   { type: 'Point', coordinates: disaster.coords },
              properties: {},
            },
          })

          // Expanding pulse ring
          map.addLayer({
            id:     `pulse-${disaster.id}`,
            type:   'circle',
            source: `epi-${disaster.id}`,
            paint: {
              'circle-radius':          8,
              'circle-color':           'rgba(0,0,0,0)',
              'circle-opacity':         0,
              'circle-stroke-width':    2.5,
              'circle-stroke-color':    disaster.dotColor,
              'circle-stroke-opacity':  1,
              'circle-pitch-alignment': 'map',
            },
          })

          // Solid centre dot
          map.addLayer({
            id:     `dot-${disaster.id}`,
            type:   'circle',
            source: `epi-${disaster.id}`,
            paint: {
              'circle-radius':          5,
              'circle-color':           '#ffffff',
              'circle-stroke-width':    2,
              'circle-stroke-color':    disaster.dotColor,
              'circle-pitch-alignment': 'map',
            },
          })
        })

        // Disable built-in double-click zoom so we can handle it ourselves
        map.doubleClickZoom.disable()

        // Pointer cursor on hover over any dot layer
        const dotLayerIds = GLOBAL_DISASTERS.map(d => `dot-${d.id}`)
        dotLayerIds.forEach(layerId => {
          map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
        })

        // Double-click on a dot → zoom to that disaster; anywhere else → zoom in normally
        map.on('dblclick', e => {
          const hit = map.queryRenderedFeatures(e.point, { layers: dotLayerIds })
          if (hit.length > 0) {
            const disaster = GLOBAL_DISASTERS.find(d => `epi-${d.id}` === hit[0].source)
            if (disaster) {
              map.easeTo({ center: disaster.coords, zoom: 10, duration: 900 })
              return
            }
          }
          // Fallback: replicate default zoom-in at cursor
          map.easeTo({ center: e.lngLat, zoom: map.getZoom() + 1, duration: 300 })
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
  }, [initialCenter, initialZoom, startPulse])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="h-full w-full" ref={mapContainerRef} />

      {/* Disaster legend */}
      <div className="absolute left-4 top-4 z-20 w-[260px] rounded-xl border border-white/20 bg-black/75 p-4 backdrop-blur">
        <div className="pointer-events-none mb-3 flex items-center gap-2">
          <Badge variant="outline" className="border-white/30 text-white/80">Live Events</Badge>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">
            {ready ? `${GLOBAL_DISASTERS.length} active` : 'Loading…'}
          </p>
        </div>

        <div className="space-y-2">
          {GLOBAL_DISASTERS.map(d => (
            <button
              key={d.id}
              onClick={() => mapRef.current?.easeTo({ center: d.coords, zoom: 10, duration: 900 })}
              className="flex w-full items-start gap-2.5 rounded-lg bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
            >
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: d.dotColor }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{d.label}</p>
                <p className="truncate text-xs text-white/50">{d.location}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20">
        <Button onClick={onExit} variant="secondary">Back to Globe</Button>
      </div>
    </div>
  )
}
