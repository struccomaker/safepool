'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, Polygon } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { GlobeCountrySelection } from '@/components/GlobeScene'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DISASTER_PINS, BRAZIL_EQ_PIN, type DisasterPin } from '@/lib/disaster-pins'
import { getBrazilStatus, type BrazilStatus } from '@/lib/brazil-eq-state'

// Re-shape shared pins into the format this component expects
const GLOBAL_DISASTERS = DISASTER_PINS.map((p) => ({
  id:          p.id,
  label:       p.label,
  location:    p.location,
  coords:      p.coords,   // [lng, lat] — GeoJSON order
  dotColor:    p.dotColor,
  rings:       p.rings2d,
  countryCode: p.countryCode,
}))

function brazilDotColor(status: BrazilStatus): string {
  if (status === 'Payout Given') return '#f59e0b'
  if (status === 'Monitoring')   return '#22c55e'
  return BRAZIL_EQ_PIN.dotColor
}

// Initial zoom per clicked country — zooms in on the relevant disaster
const COUNTRY_ZOOM: Record<string, number> = {
  PH: 10, ID: 10, TH: 10, NP: 10, JP: 10, US: 10,
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
  const mapContainerRef  = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<MapLibreMap | null>(null)
  const pulseRafRef      = useRef<number | null>(null)
  const brazilPulseRef   = useRef<number | null>(null)
  const [ready, setReady]           = useState(false)
  const [brazilStatus, setBrazilStatus] = useState<BrazilStatus>(getBrazilStatus)
  const [selectedDisaster, setSelectedDisaster] = useState<DisasterPin | null>(null)

  // Keep module-level var in sync so late mounts read current status
  useEffect(() => {
    const onDemo     = () => setBrazilStatus('Triggered')
    const onResolved = () => setBrazilStatus('Payout Given')
    const onEnd      = () => setBrazilStatus('Monitoring')
    window.addEventListener('safepool:earthquake-demo',     onDemo)
    window.addEventListener('safepool:earthquake-resolved', onResolved)
    window.addEventListener('safepool:earthquake-end',      onEnd)
    return () => {
      window.removeEventListener('safepool:earthquake-demo',     onDemo)
      window.removeEventListener('safepool:earthquake-resolved', onResolved)
      window.removeEventListener('safepool:earthquake-end',      onEnd)
    }
  }, [])

  const initialCenter = useMemo((): [number, number] => {
    const code = country.code.toUpperCase()
    const currentBrazil = getBrazilStatus()

    const all = currentBrazil
      ? [...GLOBAL_DISASTERS, { ...BRAZIL_EQ_PIN, dotColor: brazilDotColor(currentBrazil), rings: BRAZIL_EQ_PIN.rings2d, countryCode: BRAZIL_EQ_PIN.countryCode }]
      : GLOBAL_DISASTERS

    if (all.length === 0) return [country.center.lng, country.center.lat]

    // Find the globally nearest disaster
    const refLng = country.center.lng
    const refLat = country.center.lat
    let nearest = all[0]
    let nearestDist = Infinity

    for (const d of all) {
      const dlat = d.coords[1] - refLat
      const dlng = d.coords[0] - refLng
      const dist = dlat * dlat + dlng * dlng
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = d
      }
    }

    // Snap if the disaster belongs to this country (by code) OR is within ~4 degrees
    // (handles geographic-center → epicenter offset within a single country).
    // If it's a clearly different country (code mismatch AND far away), stay on the
    // country the user actually clicked.
    const codeMatches = nearest.countryCode === code
    const withinCountry = nearestDist < 16 // 4° radius squared
    if (!codeMatches && !withinCountry) return [country.center.lng, country.center.lat]

    return nearest.coords
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

  // Add / update / remove Brazil pin layers whenever status or map readiness changes
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const map = mapRef.current
    const dotColor = brazilDotColor(brazilStatus)

    if (brazilStatus === null) {
      // Remove all Brazil layers if they exist
      BRAZIL_EQ_PIN.rings2d.forEach((_, i) => {
        if (map.getLayer(`ring-brazil-eq-${i}`))        map.removeLayer(`ring-brazil-eq-${i}`)
        if (map.getLayer(`ring-stroke-brazil-eq-${i}`)) map.removeLayer(`ring-stroke-brazil-eq-${i}`)
      })
      if (map.getLayer('pulse-brazil-eq')) map.removeLayer('pulse-brazil-eq')
      if (map.getLayer('dot-brazil-eq'))   map.removeLayer('dot-brazil-eq')
      if (map.getSource('rings-brazil-eq')) map.removeSource('rings-brazil-eq')
      if (map.getSource('epi-brazil-eq'))   map.removeSource('epi-brazil-eq')
      return
    }

    if (!map.getSource('epi-brazil-eq')) {
      // First time — add sources and layers
      const ringsGeo = buildRings(BRAZIL_EQ_PIN.coords, BRAZIL_EQ_PIN.rings2d)
      map.addSource('rings-brazil-eq', { type: 'geojson', data: ringsGeo })
      BRAZIL_EQ_PIN.rings2d.forEach(([, fillColor, fillOpacity, strokeOpacity], i) => {
        map.addLayer({ id: `ring-brazil-eq-${i}`, type: 'fill', source: 'rings-brazil-eq',
          filter: ['==', ['get', 'ring'], i], paint: { 'fill-color': fillColor, 'fill-opacity': fillOpacity } })
        map.addLayer({ id: `ring-stroke-brazil-eq-${i}`, type: 'line', source: 'rings-brazil-eq',
          filter: ['==', ['get', 'ring'], i],
          paint: { 'line-color': fillColor, 'line-opacity': strokeOpacity, 'line-width': 1, 'line-blur': 1.5 } })
      })
      map.addSource('epi-brazil-eq', { type: 'geojson', data: {
        type: 'Feature', geometry: { type: 'Point', coordinates: BRAZIL_EQ_PIN.coords }, properties: {},
      }})
      map.addLayer({ id: 'pulse-brazil-eq', type: 'circle', source: 'epi-brazil-eq', paint: {
        'circle-radius': 8, 'circle-color': 'rgba(0,0,0,0)', 'circle-opacity': 0,
        'circle-stroke-width': 2.5, 'circle-stroke-color': dotColor, 'circle-stroke-opacity': 1,
        'circle-pitch-alignment': 'map',
      }})
      map.addLayer({ id: 'dot-brazil-eq', type: 'circle', source: 'epi-brazil-eq', paint: {
        'circle-radius': 5, 'circle-color': '#ffffff',
        'circle-stroke-width': 2, 'circle-stroke-color': dotColor,
        'circle-pitch-alignment': 'map',
      }})
    } else {
      // Already added — just update the dot color
      map.setPaintProperty('pulse-brazil-eq', 'circle-stroke-color', dotColor)
      map.setPaintProperty('dot-brazil-eq',   'circle-stroke-color', dotColor)
    }
  }, [ready, brazilStatus])

  // Separate pulse animation loop for the Brazil pin
  useEffect(() => {
    if (!ready || !mapRef.current || brazilStatus === null) return
    const map = mapRef.current
    const PERIOD = 1600
    const t0 = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t       = ((now - t0) % PERIOD) / PERIOD
      const radius  = 8 + t * 38
      const opacity = Math.min(1, Math.max(0, 1 - t))
      if (map.getLayer('pulse-brazil-eq')) {
        map.setPaintProperty('pulse-brazil-eq', 'circle-radius',         radius)
        map.setPaintProperty('pulse-brazil-eq', 'circle-stroke-opacity', opacity)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    brazilPulseRef.current = raf
    return () => { cancelAnimationFrame(raf); brazilPulseRef.current = null }
  }, [ready, brazilStatus])

  const handleSelectDisaster = (pin: DisasterPin) => {
    setSelectedDisaster(pin)
    mapRef.current?.easeTo({ center: pin.coords, zoom: 10, duration: 900 })
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="h-full w-full" ref={mapContainerRef} />

      {/* Left column: mock data panel + live events — positioned below logo */}
      <div className="absolute left-4 top-[4.5rem] z-20 flex w-[260px] flex-col gap-3">

        {/* Impact data panel — shown when a disaster is selected */}
        {selectedDisaster && (
          <div className="rounded-xl border border-white/20 bg-black/80 p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedDisaster.dotColor }} />
                <p className="text-sm font-semibold text-white">{selectedDisaster.label}</p>
              </div>
              <button onClick={() => setSelectedDisaster(null)} className="text-white/40 transition-colors hover:text-white/80">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <p className="mb-3 text-xs text-white/50">{selectedDisaster.location}</p>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-red-500/10 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-red-300/70">Deaths</p>
                <p className="text-lg font-bold text-red-400">{selectedDisaster.impact.deaths.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-orange-500/10 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-orange-300/70">Injuries</p>
                <p className="text-lg font-bold text-orange-400">{selectedDisaster.impact.injuries.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-amber-300/70">Displaced</p>
                <p className="text-lg font-bold text-amber-400">{selectedDisaster.impact.displaced.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/50">Property Damage</p>
                <p className="text-lg font-bold text-white/90">${(selectedDisaster.impact.propertyDamageUsd / 1_000_000).toFixed(0)}M</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-green-300/70">Pool Payout</p>
                <p className="text-sm font-semibold text-green-400">${selectedDisaster.payoutAmount.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-white/50">Severity</p>
                <p className="text-sm font-semibold text-white">{selectedDisaster.severity}</p>
              </div>
            </div>
          </div>
        )}

        {/* Disaster legend */}
        <div className="rounded-xl border border-white/20 bg-black/75 p-4 backdrop-blur">
          <div className="pointer-events-none mb-3 flex items-center gap-2">
            <Badge variant="outline" className="border-white/30 text-white/80">Live Events</Badge>
            <p className="text-xs uppercase tracking-[0.18em] text-white/50">
              {ready ? `${GLOBAL_DISASTERS.length + (brazilStatus !== null ? 1 : 0)} active` : 'Loading\u2026'}
            </p>
          </div>

          <div className="space-y-2">
            {brazilStatus !== null && (
              <button
                onClick={() => handleSelectDisaster({ ...BRAZIL_EQ_PIN, dotColor: brazilDotColor(brazilStatus) })}
                className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${selectedDisaster?.id === BRAZIL_EQ_PIN.id ? 'bg-white/15 ring-1 ring-white/20' : 'bg-white/5 hover:bg-white/10'}`}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: brazilDotColor(brazilStatus) }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{BRAZIL_EQ_PIN.label}</p>
                  <p className="truncate text-xs text-white/50">{BRAZIL_EQ_PIN.location}</p>
                </div>
              </button>
            )}

            {GLOBAL_DISASTERS.map(d => {
              const pin = DISASTER_PINS.find(p => p.id === d.id)!
              return (
                <button
                  key={d.id}
                  onClick={() => handleSelectDisaster(pin)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${selectedDisaster?.id === d.id ? 'bg-white/15 ring-1 ring-white/20' : 'bg-white/5 hover:bg-white/10'}`}
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
              )
            })}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20">
        <Button onClick={onExit} variant="secondary">Back to Globe</Button>
      </div>
    </div>
  )
}
