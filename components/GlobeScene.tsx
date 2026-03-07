'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GlobeMethods } from 'react-globe.gl'
import { DISASTER_PINS } from '@/lib/disaster-pins'

const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="h-16 w-16 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
    </div>
  ),
})

const COUNTRY_GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json'
const DISASTER_COUNTRY_CODES = new Set(['PH', 'ID', 'TH', 'NP', 'JP'])

const ARCS = [
  { startLat: 37.77,  startLng: -122.42, endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },
  { startLat: 51.51,  startLng: -0.13,   endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },
  { startLat: 35.68,  startLng: 139.65,  endLat: -6.21,  endLng: 106.85, color: ['#00e5ff', '#06b6d4'] },
  { startLat: 48.86,  startLng: 2.35,    endLat: 27.72,  endLng: 85.32,  color: ['#00ffcc', '#22c55e'] },
  { startLat: -33.87, startLng: 151.21,  endLat: 13.76,  endLng: 100.50, color: ['#00e5ff', '#06b6d4'] },
  { startLat: 1.35,   startLng: 103.82,  endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },
  { startLat: 40.71,  startLng: -74.01,  endLat: -6.21,  endLng: 106.85, color: ['#00e5ff', '#06b6d4'] },
]

// Derived from DISASTER_PINS — single source of truth for epicentre coordinates
const RINGS = DISASTER_PINS.map((p) => ({
  lat: p.coords[1],
  lng: p.coords[0],
  ...p.ring3d,
  color: () => p.dotColor,
}))

const POINTS = DISASTER_PINS.map((p) => ({
  lat: p.coords[1],
  lng: p.coords[0],
  size: p.pointSize,
  color: p.dotColor,
  label: `${p.label} · ${p.location}`,
}))

type LngLat = [number, number]
type Ring = LngLat[]
type PolygonCoordinates = Ring[]
type MultiPolygonCoordinates = PolygonCoordinates[]

type CountryGeometry =
  | {
      type: 'Polygon'
      coordinates: PolygonCoordinates
    }
  | {
      type: 'MultiPolygon'
      coordinates: MultiPolygonCoordinates
    }

interface CountryFeature {
  type: 'Feature'
  id?: string | number
  properties: {
    name?: string
    ADMIN?: string
    ISO_A2?: string
    iso_a2?: string
    [key: string]: unknown
  }
  geometry: CountryGeometry
}

interface CountriesResponse {
  features?: CountryFeature[]
}

function isCountryFeature(value: unknown): value is CountryFeature {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CountryFeature>
  return candidate.type === 'Feature' && candidate.geometry != null && candidate.properties != null
}

export interface GlobeCountrySelection {
  code: string
  name: string
  center: {
    lat: number
    lng: number
  }
}

function getCountryName(feature: CountryFeature): string {
  return feature.properties.name ?? feature.properties.ADMIN ?? String(feature.id ?? 'Unknown')
}

function getCountryCode(feature: CountryFeature): string {
  const rawCode = feature.properties.ISO_A2 ?? feature.properties.iso_a2 ?? feature.id
  if (!rawCode) return getCountryName(feature).toUpperCase().slice(0, 2)
  return String(rawCode).toUpperCase()
}

function ringSignedArea(ring: Ring) {
  if (ring.length < 3) return 0

  let area = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[index + 1]
    area += (x2 - x1) * (y2 + y1)
  }

  return area
}

function normalizeRingWinding(ring: Ring, shouldBeClockwise: boolean): Ring {
  const isClockwise = ringSignedArea(ring) > 0
  if (isClockwise === shouldBeClockwise) return ring
  return [...ring].reverse()
}

function normalizePolygonWinding(coordinates: PolygonCoordinates): PolygonCoordinates {
  if (!coordinates.length) return coordinates

  const [outerRing, ...holes] = coordinates
  const normalizedOuter = normalizeRingWinding(outerRing, true)
  const normalizedHoles = holes.map((hole) => normalizeRingWinding(hole, false))

  return [normalizedOuter, ...normalizedHoles]
}

function normalizeCountryGeometry(feature: CountryFeature): CountryFeature {
  if (feature.geometry.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: normalizePolygonWinding(feature.geometry.coordinates),
      },
    }
  }

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map((polygon) => normalizePolygonWinding(polygon)),
    },
  }
}

function collectLngLat(value: unknown, collector: Array<[number, number]>) {
  if (!Array.isArray(value)) return

  if (
    value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
  ) {
    collector.push([value[0], value[1]])
    return
  }

  for (const entry of value) {
    collectLngLat(entry, collector)
  }
}

function getFeatureCenter(feature: CountryFeature): { lat: number; lng: number } {
  const coordinates: Array<[number, number]> = []
  collectLngLat(feature.geometry.coordinates, coordinates)

  if (!coordinates.length) {
    return { lat: 0, lng: 0 }
  }

  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180

  for (const [lng, lat] of coordinates) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }

  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  }
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function isFrontHemisphere(country: { lat: number; lng: number }, pov: { lat: number; lng: number }) {
  const countryLat = toRadians(country.lat)
  const countryLng = toRadians(country.lng)
  const povLat = toRadians(pov.lat)
  const povLng = toRadians(pov.lng)

  const dot =
    Math.sin(countryLat) * Math.sin(povLat)
    + Math.cos(countryLat) * Math.cos(povLat) * Math.cos(countryLng - povLng)

  return dot > 0
}

interface GlobeMaterial {
  color: { set: (value: string) => void }
  emissive: { set: (value: string) => void }
  shininess: number
}

interface GlobeSceneProps {
  monochrome?: boolean
  className?: string
  onCountryDrilldown?: (selection: GlobeCountrySelection) => void
  activeCountryCode?: string | null
  onGlobeReady?: () => void
}

export default function GlobeScene({
  monochrome = false,
  className = '',
  onCountryDrilldown,
  activeCountryCode = null,
  onGlobeReady,
}: GlobeSceneProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const drilldownTimerRef = useRef<number | null>(null)
  const [size, setSize] = useState({ width: 960, height: 720 })
  const [countries, setCountries] = useState<CountryFeature[]>([])
  const [hoveredCountryCode, setHoveredCountryCode] = useState<string | null>(null)
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(activeCountryCode)
  const [clickRings, setClickRings] = useState<Array<{ id: number; lat: number; lng: number; maxR: number; propagationSpeed: number; repeatPeriod: number; color: () => string }>>([])
  const clickRingCounterRef = useRef(0)

  const monoArcs = useMemo(
    () =>
      ARCS.map((arc) => ({
        ...arc,
        color: ['#d4d4d8', '#ffffff'],
      })),
    []
  )

  const monoRings = useMemo(
    () =>
      RINGS.map((ring, index) => ({
        ...ring,
        color: () => (index % 2 === 0 ? '#ffffff' : '#a1a1aa'),
      })),
    []
  )

  const monoPoints = useMemo(
    () =>
      POINTS.map((point, index) => ({
        ...point,
        color: index % 2 === 0 ? '#ffffff' : '#d4d4d8',
      })),
    []
  )

  useEffect(() => {
    if (!wrapperRef.current) return

    const measure = () => {
      const nextWidth = Math.max(wrapperRef.current?.clientWidth ?? 960, 320)
      const nextHeight = Math.max(wrapperRef.current?.clientHeight ?? 720, 320)
      setSize({ width: nextWidth, height: nextHeight })
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(wrapperRef.current)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadCountries = async () => {
      try {
        const response = await fetch(COUNTRY_GEOJSON_URL, { cache: 'force-cache' })
        if (!response.ok) return

        const payload = (await response.json()) as CountriesResponse
        if (!cancelled && Array.isArray(payload.features)) {
          setCountries(
            payload.features
              .filter((feature) => feature?.geometry != null)
              .map((feature) => normalizeCountryGeometry(feature))
          )
        }
      } catch {
        if (!cancelled) {
          setCountries([])
        }
      }
    }

    loadCountries()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSelectedCountryCode(activeCountryCode)
  }, [activeCountryCode])

  useEffect(() => {
    if (!wrapperRef.current) return
    wrapperRef.current.style.cursor = hoveredCountryCode ? 'pointer' : 'default'
  }, [hoveredCountryCode])

  useEffect(() => {
    return () => {
      if (drilldownTimerRef.current !== null) {
        window.clearTimeout(drilldownTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!globeRef.current) return

    const ctrl = globeRef.current.controls()
    ctrl.autoRotate = true
    ctrl.autoRotateSpeed = monochrome ? 0.22 : 0.4
    ctrl.enableZoom = false
    ctrl.enablePan = false
    globeRef.current.pointOfView({ lat: 8, lng: 118, altitude: 1.75 }, 1200)

    const materialApi = globeRef.current as GlobeMethods & { globeMaterial?: () => GlobeMaterial }
    if (monochrome && materialApi.globeMaterial) {
      const material = materialApi.globeMaterial()
      material.color.set('#0d0d0f')
      material.emissive.set('#09090b')
      material.shininess = 0.2
    }
  }, [monochrome])

  useEffect(() => {
    if (!globeRef.current) return

    const ctrl = globeRef.current.controls()
    if (hoveredCountryCode) {
      ctrl.autoRotate = false
      return
    }

    if (!selectedCountryCode) {
      ctrl.autoRotate = true
      ctrl.autoRotateSpeed = monochrome ? 0.22 : 0.4
    }
  }, [hoveredCountryCode, selectedCountryCode, monochrome])

  const arcsData = monochrome ? monoArcs : ARCS
  const baseRings = monochrome ? monoRings : RINGS
  const ringsData = [...baseRings, ...clickRings]
  const pointsData = monochrome ? monoPoints : POINTS

  const pointerEventsFilter = (object: object, data?: object) => {
    if (!isCountryFeature(data) || !globeRef.current) {
      return true
    }

    const pov = globeRef.current.pointOfView()
    const center = getFeatureCenter(data)
    return isFrontHemisphere(center, { lat: pov.lat, lng: pov.lng })
  }

  const handlePolygonClick = (polygon: object) => {
    const feature = polygon as CountryFeature
    const center = getFeatureCenter(feature)
    const code = getCountryCode(feature)
    const name = getCountryName(feature)

    setSelectedCountryCode(code)

    if (globeRef.current) {
      const controls = globeRef.current.controls()
      controls.autoRotate = false
      globeRef.current.pointOfView({ lat: center.lat, lng: center.lng, altitude: 0.78 }, 900)
    }

    if (!onCountryDrilldown) return

    if (drilldownTimerRef.current !== null) {
      window.clearTimeout(drilldownTimerRef.current)
    }

    drilldownTimerRef.current = window.setTimeout(() => {
      onCountryDrilldown({ code, name, center })
    }, 700)
  }


  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!globeRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const globe = globeRef.current as GlobeMethods & {
      toGlobeCoords: (x: number, y: number) => { lat: number; lng: number } | null
    }
    const coords = globe.toGlobeCoords(x, y)
    if (!coords) return // clicked off the sphere
    const ringId = ++clickRingCounterRef.current
    setClickRings((prev) => [
      ...prev,
      { id: ringId, lat: coords.lat, lng: coords.lng, maxR: 6, propagationSpeed: 5, repeatPeriod: 99999, color: () => '#ffffff' },
    ])
    setTimeout(() => {
      setClickRings((prev) => prev.filter((r) => r.id !== ringId))
    }, 1300)
  }

  return (
    <div className={`relative ${className}`.trim()} ref={wrapperRef} onClick={handleWrapperClick}>
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        globeImageUrl={
          monochrome
            ? '//unpkg.com/three-globe/example/img/earth-topology.png'
            : '//unpkg.com/three-globe/example/img/earth-night.jpg'
        }
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor={monochrome ? '#ffffff' : '#06b6d4'}
        atmosphereAltitude={monochrome ? 0.12 : 0.28}
        backgroundColor="rgba(0,0,0,0)"
        arcsData={arcsData}
        arcColor="color"
        arcAltitude={0.35}
        arcStroke={0.5}
        arcDashLength={0.35}
        arcDashGap={0.15}
        arcDashAnimateTime={monochrome ? 2200 : 1800}
        ringsData={ringsData}
        ringColor="color"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        pointsData={pointsData}
        pointColor="color"
        pointAltitude={0.012}
        pointRadius="size"
        pointResolution={8}
        pointLabel="label"
        onGlobeReady={onGlobeReady}
        polygonsData={countries}
        polygonGeoJsonGeometry="geometry"
        polygonAltitude={(polygon) => {
          const feature = polygon as CountryFeature
          const code = getCountryCode(feature)
          const isDisasterCountry = DISASTER_COUNTRY_CODES.has(code)

          if (selectedCountryCode === code) return 0.02
          if (hoveredCountryCode === code) return 0.012
          if (isDisasterCountry) return 0.004
          return 0.001
        }}
        polygonCapColor={(polygon) => {
          const feature = polygon as CountryFeature
          const code = getCountryCode(feature)
          const isDisasterCountry = DISASTER_COUNTRY_CODES.has(code)

          if (selectedCountryCode === code) return 'rgba(239,68,68,0.42)'
          if (hoveredCountryCode === code) return isDisasterCountry ? 'rgba(239,68,68,0.34)' : 'rgba(255,255,255,0.18)'
          if (isDisasterCountry) return 'rgba(239,68,68,0.2)'
          return 'rgba(255,255,255,0)'
        }}
        polygonSideColor={(polygon) => {
          const feature = polygon as CountryFeature
          const code = getCountryCode(feature)
          const isDisasterCountry = DISASTER_COUNTRY_CODES.has(code)

          if (selectedCountryCode === code) return 'rgba(239,68,68,0.26)'
          if (hoveredCountryCode === code) return isDisasterCountry ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.1)'
          if (isDisasterCountry) return 'rgba(239,68,68,0.18)'
          return 'rgba(255,255,255,0)'
        }}
        polygonStrokeColor={(polygon) => {
          const feature = polygon as CountryFeature
          const code = getCountryCode(feature)
          const isDisasterCountry = DISASTER_COUNTRY_CODES.has(code)

          if (selectedCountryCode === code) return 'rgba(248,113,113,1)'
          if (hoveredCountryCode === code) return isDisasterCountry ? 'rgba(248,113,113,0.95)' : 'rgba(255,255,255,0.9)'
          if (isDisasterCountry) return 'rgba(248,113,113,0.75)'
          return 'rgba(255,255,255,0.28)'
        }}
        polygonCapCurvatureResolution={4}
        polygonsTransitionDuration={250}
        polygonLabel={(polygon) => {
          const feature = polygon as CountryFeature
          return getCountryName(feature)
        }}
        onPolygonHover={(polygon) => {
          if (!polygon) {
            setHoveredCountryCode(null)
            return
          }

          const feature = polygon as CountryFeature
          setHoveredCountryCode(getCountryCode(feature))
        }}
        onPolygonClick={handlePolygonClick}
        pointerEventsFilter={pointerEventsFilter}
      />
    </div>
  )
}
