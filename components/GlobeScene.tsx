'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GlobeMethods } from 'react-globe.gl'
import { AnimationAction, AnimationClip, AnimationMixer, Box3, Euler, Group, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DISASTER_PINS, getDisastersByCountry } from '@/lib/disaster-pins'
import { getBrazilStatus } from '@/lib/brazil-eq-state'

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

const BRAZIL_PERM_RINGS = [
  { lat: -9.19, lng: -70.81, maxR: 6, propagationSpeed: 3,  repeatPeriod: 1500, color: () => '#ffffff' },
  { lat: -9.19, lng: -70.81, maxR: 3.5, propagationSpeed: 5, repeatPeriod: 1100, color: () => '#d4d4d8' },
]

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
  lat:      p.coords[1],
  lng:      p.coords[0],
  altitude: 0.012,
  size:     p.pointSize,
  color:    p.dotColor,
  label:    `${p.label} · ${p.location}`,
}))

// Payout cylinders — tall green pillars, height scales with payoutAmount
const PAYOUT_CYLINDERS = DISASTER_PINS.map((p) => ({
  lat:      p.coords[1],
  lng:      p.coords[0],
  altitude: 0.03 + (p.payoutAmount / 50000) * 0.04,
  size:     0.35,
  color:    '#22c55e',
  label:    `${p.label} · $${(p.payoutAmount / 1000).toFixed(1)}k payout`,
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

function getBearingRadians(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const fromLat = toRadians(from.lat)
  const toLat = toRadians(to.lat)
  const deltaLng = toRadians(to.lng - from.lng)

  const y = Math.sin(deltaLng) * Math.cos(toLat)
  const x = Math.cos(fromLat) * Math.sin(toLat)
    - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)

  return Math.atan2(y, x)
}

function clampLatitude(value: number) {
  return Math.max(-84, Math.min(84, value))
}

function wrapLongitude(value: number) {
  if (value > 180) return value - 360
  if (value < -180) return value + 360
  return value
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

/**
 * Calculate great-circle distance between two points on Earth using Haversine formula.
 * Returns distance in kilometers.
 */
function getDistanceBetweenCoords(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.asin(Math.sqrt(a))
  return R * c
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

interface ClickRing {
  id: number
  lat: number
  lng: number
  maxR: number
  propagationSpeed: number
  repeatPeriod: number
  color: () => string
}

interface GodzillaPlacement {
  id: number
  lat: number
  lng: number
  altitude: number
  object: Group
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
  const [clickRings, setClickRings] = useState<ClickRing[]>([])
  const [godzillaPlacement, setGodzillaPlacement] = useState<GodzillaPlacement | null>(null)
  const [showFps, setShowFps] = useState(false)
  const [fps, setFps] = useState(0)
  const [userArcs, setUserArcs] = useState<Array<{ id: number; startLat: number; startLng: number; endLat: number; endLng: number; color: [string, string] }>>([])
  const [brazilEqCylinder, setBrazilEqCylinder] = useState<{ lat: number; lng: number; altitude: number; size: number; color: string; label: string } | null>(() => {
    const s = getBrazilStatus()
    if (s === 'Monitoring' || s === 'Payout Given') {
      return { lat: -9.19, lng: -70.81, altitude: 0.07, size: 0.35, color: '#22c55e', label: 'Relief Dispatched · Acre, Brazil' }
    }
    return null
  })
  const [showBrazilPermRings, setShowBrazilPermRings] = useState(() => {
    const s = getBrazilStatus()
    return s === 'Monitoring' || s === 'Payout Given'
  })
  const clickRingCounterRef = useRef(0)
  const userArcCounterRef = useRef(0)
  const brazilEqTimerRef = useRef<number | null>(null)
  const brazilEqRingIdsRef = useRef<[number, number] | null>(null)
  const brazilDropRafRef = useRef<number | null>(null)
  const eqLockRef = useRef(false)
  const godzillaTemplateRef = useRef<Group | null>(null)
  const godzillaClipsRef = useRef<AnimationClip[]>([])
  const godzillaSpawnRafRef = useRef<number | null>(null)
  const godzillaMixerRef = useRef<AnimationMixer | null>(null)
  const godzillaWalkActionRef = useRef<AnimationAction | null>(null)
  const godzillaHeadingRef = useRef(0)
  const godzillaPlacementRef = useRef<GodzillaPlacement | null>(null)
  const wasMovingRef = useRef(false)
  const fpsSampleRef = useRef({
    frames: 0,
    elapsedMs: 0,
  })
  const movementKeysRef = useRef({
    w: false,
    a: false,
    d: false,
  })

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
    const loader = new GLTFLoader()

    loader.load(
      '/godzilla.glb',
      (gltf) => {
        if (cancelled) return

        const template = gltf.scene
        template.updateMatrixWorld(true)

        const box = new Box3().setFromObject(template)
        const size = new Vector3()
        box.getSize(size)

        if (size.y > 0) {
          const targetHeight = 0.16
          const scale = (targetHeight / size.y) * 300
          template.scale.multiplyScalar(scale)
          template.updateMatrixWorld(true)
        }

        template.rotation.set(Math.PI / 2, Math.PI, 0)
        godzillaTemplateRef.current = template
        godzillaClipsRef.current = gltf.animations ?? []
      },
      undefined,
      () => {
        godzillaTemplateRef.current = null
        godzillaClipsRef.current = []
      }
    )

    return () => {
      cancelled = true
    }
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

      if (godzillaSpawnRafRef.current !== null) {
        window.cancelAnimationFrame(godzillaSpawnRafRef.current)
      }

      if (godzillaMixerRef.current) {
        godzillaMixerRef.current.stopAllAction()
        godzillaMixerRef.current = null
      }

      godzillaWalkActionRef.current = null
    }
  }, [])

  useEffect(() => {
    const handleToggleFps = (event: KeyboardEvent) => {
      if (event.code !== 'Backquote' && event.key !== '`' && event.key !== '~') return
      event.preventDefault()
      setShowFps((prev) => !prev)
    }

    window.addEventListener('keydown', handleToggleFps)
    return () => window.removeEventListener('keydown', handleToggleFps)
  }, [])

  useEffect(() => {
    const handleEarthquakeDemo = (event: KeyboardEvent) => {
      if (event.key !== '2') return
      event.preventDefault()

      if (globeRef.current) {
        const ctrl = globeRef.current.controls()
        ctrl.autoRotate = false
        ctrl.enableRotate = false
        globeRef.current.pointOfView({ lat: -9.19, lng: -70.81, altitude: 0.9 }, 1600)
      }
      eqLockRef.current = true
      setShowBrazilPermRings(false)

      // Pulsing red rings at the Brazil epicentre (two rings, different speeds like existing disasters)
      const ring1Id = ++clickRingCounterRef.current
      const ring2Id = ++clickRingCounterRef.current
      setClickRings((prev) => [
        ...prev,
        { id: ring1Id, lat: -9.19, lng: -70.81, maxR: 8,  propagationSpeed: 3,   repeatPeriod: 1000, color: () => '#ef4444' },
        { id: ring2Id, lat: -9.19, lng: -70.81, maxR: 5,  propagationSpeed: 5,   repeatPeriod: 800,  color: () => '#f87171' },
      ])

      // Red cylinder at the epicentre
      setBrazilEqCylinder({
        lat: -9.19,
        lng: -70.81,
        altitude: 0.07,
        size: 0.35,
        color: '#ef4444',
        label: 'M7.4 Earthquake · Acre, Brazil',
      })

      // Cancel any previous auto-clear
      if (brazilEqTimerRef.current !== null) clearTimeout(brazilEqTimerRef.current)

      brazilEqRingIdsRef.current = [ring1Id, ring2Id]
      brazilEqTimerRef.current = window.setTimeout(() => {
        setClickRings((prev) => prev.filter((r) => r.id !== ring1Id && r.id !== ring2Id))
        setBrazilEqCylinder(null)
        brazilEqTimerRef.current = null
      }, 14000)

      window.dispatchEvent(new CustomEvent('safepool:earthquake-demo'))
    }

    window.addEventListener('keydown', handleEarthquakeDemo)
    return () => window.removeEventListener('keydown', handleEarthquakeDemo)
  }, [])

  useEffect(() => {
    const handleResolved = () => {
      // Cancel auto-clear
      if (brazilEqTimerRef.current !== null) {
        clearTimeout(brazilEqTimerRef.current)
        brazilEqTimerRef.current = null
      }
      // Remove red rings immediately
      if (brazilEqRingIdsRef.current) {
        const [r1, r2] = brazilEqRingIdsRef.current
        setClickRings((prev) => prev.filter((r) => r.id !== r1 && r.id !== r2))
        brazilEqRingIdsRef.current = null
      }
      // Cancel any in-progress drop animation
      if (brazilDropRafRef.current !== null) {
        cancelAnimationFrame(brazilDropRafRef.current)
        brazilDropRafRef.current = null
      }

      const START_ALT  = 2.4
      const TARGET_ALT = 0.07
      const DROP_MS    = 500
      const BOUNCE_MS  = 280
      const DELAY_MS   = 2000  // cylinder appears at t=12s

      window.setTimeout(() => {
        // Place the green cylinder high above the globe
        setBrazilEqCylinder({
          lat: -9.19, lng: -70.81,
          altitude: START_ALT,
          size: 0.35,
          color: '#22c55e',
          label: 'Relief Dispatched · Acre, Brazil',
        })

        // Green burst rings fire exactly on impact
        window.setTimeout(() => {
          const id1 = ++clickRingCounterRef.current
          const id2 = ++clickRingCounterRef.current
          setClickRings((prev) => [
            ...prev,
            { id: id1, lat: -9.19, lng: -70.81, maxR: 14, propagationSpeed: 12, repeatPeriod: 99999, color: () => '#4ade80' },
            { id: id2, lat: -9.19, lng: -70.81, maxR: 8,  propagationSpeed: 18, repeatPeriod: 99999, color: () => '#86efac' },
          ])
          window.setTimeout(() => {
            setClickRings((prev) => prev.filter((r) => r.id !== id1 && r.id !== id2))
          }, 2200)
        }, DROP_MS)

        // Animate altitude: cubic ease-in drop → bounce settle
        const startTime = performance.now()
        const animate = (now: number) => {
          const elapsed = now - startTime
          let alt: number

          if (elapsed < DROP_MS) {
            const p = elapsed / DROP_MS
            alt = START_ALT + (TARGET_ALT - START_ALT) * (p * p * p)
          } else if (elapsed < DROP_MS + BOUNCE_MS) {
            const p = (elapsed - DROP_MS) / BOUNCE_MS
            alt = TARGET_ALT - Math.sin(p * Math.PI) * 0.045 * (1 - p * 0.6)
          } else {
            setBrazilEqCylinder((prev) => prev ? { ...prev, altitude: TARGET_ALT } : prev)
            setShowBrazilPermRings(true)
            brazilDropRafRef.current = null
            return
          }

          setBrazilEqCylinder((prev) => prev ? { ...prev, altitude: alt } : prev)
          brazilDropRafRef.current = requestAnimationFrame(animate)
        }

        brazilDropRafRef.current = requestAnimationFrame(animate)
      }, DELAY_MS)
    }

    window.addEventListener('safepool:earthquake-resolved', handleResolved)
    return () => window.removeEventListener('safepool:earthquake-resolved', handleResolved)
  }, [])

  useEffect(() => {
    const handleEnd = () => {
      eqLockRef.current = false
      if (globeRef.current) {
        const ctrl = globeRef.current.controls()
        ctrl.enableRotate = true
        ctrl.autoRotate = true
        ctrl.autoRotateSpeed = monochrome ? 0.22 : 0.4
      }
    }
    window.addEventListener('safepool:earthquake-end', handleEnd)
    return () => window.removeEventListener('safepool:earthquake-end', handleEnd)
  }, [monochrome])

  useEffect(() => {
    const handleFocus = (e: Event) => {
      const { lat, lng } = (e as CustomEvent<{ lat: number; lng: number }>).detail
      if (!globeRef.current) return
      const ctrl = globeRef.current.controls()
      ctrl.autoRotate = false
      globeRef.current.pointOfView({ lat, lng, altitude: 0.9 }, 1200)
    }
    window.addEventListener('safepool:focus-epicentre', handleFocus)
    return () => window.removeEventListener('safepool:focus-epicentre', handleFocus)
  }, [])

  useEffect(() => {
    const handleSpawnArc = (event: KeyboardEvent) => {
      if (event.key !== '1') return
      event.preventDefault()
      const randLat = () => Math.random() * 160 - 80
      const randLng = () => Math.random() * 360 - 180
      const arcId = ++userArcCounterRef.current
      setUserArcs((prev) => [
        ...prev,
        {
          id: arcId,
          startLat: randLat(),
          startLng: randLng(),
          endLat: randLat(),
          endLng: randLng(),
          color: ['#4ade80', '#22c55e'],
        },
      ])
      setTimeout(() => {
        setUserArcs((prev) => prev.filter((a) => a.id !== arcId))
      }, 4000)
    }

    window.addEventListener('keydown', handleSpawnArc)
    return () => window.removeEventListener('keydown', handleSpawnArc)
  }, [])

  useEffect(() => {
    let rafId: number | null = null
    let previous = performance.now()

    const tick = (now: number) => {
      const deltaSeconds = Math.min((now - previous) / 1000, 0.05)
      previous = now

      if (godzillaMixerRef.current) {
        godzillaMixerRef.current.update(deltaSeconds)
      }

      fpsSampleRef.current.frames += 1
      fpsSampleRef.current.elapsedMs += deltaSeconds * 1000
      if (fpsSampleRef.current.elapsedMs >= 300) {
        const nextFps = Math.round((fpsSampleRef.current.frames * 1000) / fpsSampleRef.current.elapsedMs)
        setFps(nextFps)
        fpsSampleRef.current = { frames: 0, elapsedMs: 0 }
      }

      const keys = movementKeysRef.current
      const rotateInput = (keys.d ? 1 : 0) - (keys.a ? 1 : 0)
      const isMoving = keys.w

      const walkAction = godzillaWalkActionRef.current
      if (walkAction) {
        walkAction.setEffectiveTimeScale(isMoving ? 2.5 : 0.35)
      }

      const placement = godzillaPlacementRef.current
      const isActive = (isMoving || rotateInput !== 0) && !!placement

      if (isActive && placement) {
        const moveSpeedDegPerSecond = 22
        const rotationSpeedRadPerSecond = 2.2

        const nextHeading = godzillaHeadingRef.current + rotateInput * rotationSpeedRadPerSecond * deltaSeconds
        godzillaHeadingRef.current = nextHeading
        placement.object.rotation.y = nextHeading

        if (isMoving) {
          const normalizedX = Math.sin(nextHeading)
          const normalizedY = Math.cos(nextHeading)

          const step = moveSpeedDegPerSecond * deltaSeconds
          const latStep = normalizedY * step
          const cosLat = Math.max(Math.cos(toRadians(placement.lat)), 0.2)
          const lngStep = (normalizedX * step) / cosLat

          placement.lat = clampLatitude(placement.lat + latStep)
          placement.lng = wrapLongitude(placement.lng + lngStep)
        }

        // Directly reposition the Three.js wrapper every frame — zero React overhead
        // Uses the exact same formula as three-globe's internal polar2Cartesian + Euler
        const wrapper = placement.object.parent
        if (wrapper) {
          const phi = ((90 - placement.lat) * Math.PI) / 180
          const theta = ((90 - placement.lng) * Math.PI) / 180
          const r = 100 * (1 + placement.altitude) // GLOBE_RADIUS = 100
          const sinPhi = Math.sin(phi)
          wrapper.position.set(
            r * sinPhi * Math.cos(theta),
            r * Math.cos(phi),
            r * sinPhi * Math.sin(theta)
          )
          // three-globe uses this exact Euler for objectFacesSurface
          const latRad = (-placement.lat * Math.PI) / 180
          const lngRad = (placement.lng * Math.PI) / 180
          wrapper.setRotationFromEuler(new Euler(latRad, lngRad, 0, 'YXZ'))
        }
      }

      // Flush final position to React state when movement stops
      if (!isActive && wasMovingRef.current && placement) {
        const updated = { ...placement }
        godzillaPlacementRef.current = updated
        setGodzillaPlacement(updated)
      }
      wasMovingRef.current = isActive

      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [])

  useEffect(() => {
    if (!godzillaPlacement) return

    if (godzillaSpawnRafRef.current !== null) {
      window.cancelAnimationFrame(godzillaSpawnRafRef.current)
      godzillaSpawnRafRef.current = null
    }

    const placementId = godzillaPlacement.id
    const placementObject = godzillaPlacement.object
    const baseScale = placementObject.scale.clone()
    const startScale = 0.04
    const endScale = 1
    const durationMs = 1400
    const startedAt = performance.now()

    const easeOutBack = (progress: number) => {
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2)
    }

    const animate = (now: number) => {
      const elapsed = now - startedAt
      const normalized = Math.min(elapsed / durationMs, 1)
      const eased = easeOutBack(normalized)
      const scaleFactor = startScale + (endScale - startScale) * eased
      placementObject.scale.set(
        baseScale.x * scaleFactor,
        baseScale.y * scaleFactor,
        baseScale.z * scaleFactor
      )

      if (normalized < 1) {
        godzillaSpawnRafRef.current = window.requestAnimationFrame(animate)
      } else {
        placementObject.scale.copy(baseScale)
        godzillaSpawnRafRef.current = null
      }
    }

    godzillaSpawnRafRef.current = window.requestAnimationFrame(animate)

    return () => {
      if (godzillaSpawnRafRef.current !== null) {
        window.cancelAnimationFrame(godzillaSpawnRafRef.current)
        godzillaSpawnRafRef.current = null
      }
    }
  }, [godzillaPlacement?.id])

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

    if (!selectedCountryCode && !eqLockRef.current) {
      ctrl.autoRotate = true
      ctrl.autoRotateSpeed = monochrome ? 0.22 : 0.4
    }
  }, [hoveredCountryCode, selectedCountryCode, monochrome])

  const arcsData = [...(monochrome ? monoArcs : ARCS), ...userArcs]
  const baseRings = monochrome ? monoRings : RINGS
  const ringsData = [...baseRings, ...clickRings, ...(showBrazilPermRings ? BRAZIL_PERM_RINGS : [])]
  const pointsData = [...(monochrome ? monoPoints : POINTS), ...PAYOUT_CYLINDERS, ...(brazilEqCylinder ? [brazilEqCylinder] : [])]

  const pointerEventsFilter = (object: object, data?: object) => {
    if (!isCountryFeature(data) || !globeRef.current) {
      return true
    }

    const pov = globeRef.current.pointOfView()
    const center = getFeatureCenter(data)
    return isFrontHemisphere(center, { lat: pov.lat, lng: pov.lng })
  }

  const getGlobeCoordsFromPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!globeRef.current) return null

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const globe = globeRef.current as GlobeMethods & {
      toGlobeCoords: (x: number, y: number) => { lat: number; lng: number } | null
    }

    return globe.toGlobeCoords(x, y)
  }

  const handlePolygonClick = (polygon: object) => {
    const feature = polygon as CountryFeature
    const code = getCountryCode(feature)
    const name = getCountryName(feature)

    setSelectedCountryCode(code)

    // Initialize target coordinates to country center by default
    let targetLat = getFeatureCenter(feature).lat
    let targetLng = getFeatureCenter(feature).lng

    if (globeRef.current) {
      const controls = globeRef.current.controls()
      controls.autoRotate = false

      // Try to find the nearest disaster epicenter for this country
      const disastersByCountry = getDisastersByCountry()
      const disastersInCountry = disastersByCountry.get(code)

      if (disastersInCountry && disastersInCountry.length > 0) {
        // Get current POV to calculate distance from viewer
        const currentPov = globeRef.current.pointOfView()

        // Find the closest disaster epicenter
        let closestDisaster = disastersInCountry[0]
        let closestDistance = getDistanceBetweenCoords(
          currentPov.lat,
          currentPov.lng,
          closestDisaster.coords[1], // latitude
          closestDisaster.coords[0]  // longitude
        )

        for (let i = 1; i < disastersInCountry.length; i++) {
          const disaster = disastersInCountry[i]
          const distance = getDistanceBetweenCoords(
            currentPov.lat,
            currentPov.lng,
            disaster.coords[1], // latitude
            disaster.coords[0]  // longitude
          )

          if (distance < closestDistance) {
            closestDistance = distance
            closestDisaster = disaster
          }
        }

        // Use the epicenter coordinates instead of country center
        targetLat = closestDisaster.coords[1]
        targetLng = closestDisaster.coords[0]
      }

      globeRef.current.pointOfView({ lat: targetLat, lng: targetLng, altitude: 0.78 }, 900)
    }

    if (!onCountryDrilldown) return

    if (drilldownTimerRef.current !== null) {
      window.clearTimeout(drilldownTimerRef.current)
    }

    drilldownTimerRef.current = window.setTimeout(() => {
      // Use the same center that was used for the globe zoom (epicenter or country center)
      onCountryDrilldown({ code, name, center: { lat: targetLat, lng: targetLng } })
    }, 700)
  }


  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getGlobeCoordsFromPointer(e)
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

  const handleWrapperContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()

    const coords = getGlobeCoordsFromPointer(e)
    if (!coords || !godzillaTemplateRef.current) return

    const pov = globeRef.current?.pointOfView()
    const facingYaw = pov
      ? getBearingRadians({ lat: coords.lat, lng: coords.lng }, { lat: pov.lat, lng: pov.lng })
      : 0

    const model = clone(godzillaTemplateRef.current) as Group
    model.rotation.y = facingYaw
    godzillaHeadingRef.current = facingYaw

    if (godzillaMixerRef.current) {
      godzillaMixerRef.current.stopAllAction()
      godzillaMixerRef.current = null
    }
    godzillaWalkActionRef.current = null

    const clips = godzillaClipsRef.current
    if (clips.length > 0) {
      const walkClip = clips.find((clip) => /walk/i.test(clip.name)) ?? clips[0]
      const mixer = new AnimationMixer(model)
      const action = mixer.clipAction(walkClip)
      action.reset()
      action.setEffectiveTimeScale(0.35)
      action.fadeIn(0.2)
      action.play()
      godzillaMixerRef.current = mixer
      godzillaWalkActionRef.current = action
    }

    const markerId = Date.now()
    const newPlacement = {
      id: markerId,
      lat: coords.lat,
      lng: coords.lng,
      altitude: 0.005,
      object: model,
    }
    godzillaPlacementRef.current = newPlacement
    setGodzillaPlacement(newPlacement)

    window.dispatchEvent(new CustomEvent('safepool:godzilla-spawned'))
  }

  const handleGodzillaClick = (datum: object) => {
    const clicked = datum as GodzillaPlacement
    if (!godzillaPlacement || clicked.id !== godzillaPlacement.id) return

    if (godzillaMixerRef.current) {
      godzillaMixerRef.current.stopAllAction()
      godzillaMixerRef.current = null
    }
    godzillaWalkActionRef.current = null
    movementKeysRef.current = {
      w: false,
      a: false,
      d: false,
    }

    godzillaPlacementRef.current = null
    setGodzillaPlacement(null)
    window.dispatchEvent(new CustomEvent('safepool:godzilla-cleared'))
  }

  const setMovementKey = (key: string, isPressed: boolean) => {
    const normalized = key.toLowerCase()
    if (normalized !== 'w' && normalized !== 'a' && normalized !== 'd') {
      return false
    }

    movementKeysRef.current = {
      ...movementKeysRef.current,
      [normalized]: isPressed,
    }
    return true
  }

  const handleWrapperKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const handled = setMovementKey(e.key, true)
    if (!handled) return
    e.preventDefault()
  }

  const handleWrapperKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const handled = setMovementKey(e.key, false)
    if (!handled) return
    e.preventDefault()
  }

  const handleWrapperBlur = () => {
    movementKeysRef.current = {
      w: false,
      a: false,
      d: false,
    }
  }

  return (
    <div
      className={`relative ${className}`.trim()}
      ref={wrapperRef}
      tabIndex={0}
      onClick={handleWrapperClick}
      onMouseDown={() => wrapperRef.current?.focus()}
      onContextMenu={handleWrapperContextMenu}
      onKeyDown={handleWrapperKeyDown}
      onKeyUp={handleWrapperKeyUp}
      onBlur={handleWrapperBlur}
    >
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
        pointAltitude="altitude"
        pointRadius="size"
        pointResolution={8}
        pointLabel="label"
        objectsData={godzillaPlacement ? [godzillaPlacement] : []}
        objectLat="lat"
        objectLng="lng"
        objectAltitude="altitude"
        objectThreeObject={(datum) => {
          const placement = datum as GodzillaPlacement
          return placement.object
        }}
        objectFacesSurfaces
        onObjectClick={handleGodzillaClick}
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
      {showFps && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-md border border-white/25 bg-black/65 px-3 py-1 font-mono text-xs text-white/90 backdrop-blur">
          FPS {fps}
        </div>
      )}
    </div>
  )
}
