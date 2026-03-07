'use client'
import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-16 h-16 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  ),
})

// Donation arcs: money flowing from donor cities to disaster zones
const ARCS = [
  { startLat: 37.77,  startLng: -122.42, endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },
  { startLat: 51.51,  startLng: -0.13,   endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },
  { startLat: 35.68,  startLng: 139.65,  endLat: -6.21,  endLng: 106.85, color: ['#00e5ff', '#06b6d4'] },
  { startLat: 48.86,  startLng: 2.35,    endLat: 27.72,  endLng: 85.32,  color: ['#00ffcc', '#22c55e'] },
  { startLat: -33.87, startLng: 151.21,  endLat: 13.76,  endLng: 100.50, color: ['#00e5ff', '#06b6d4'] },
  { startLat: 1.35,   startLng: 103.82,  endLat: 14.60,  endLng: 120.98, color: ['#00ffcc', '#22c55e'] },
  { startLat: 40.71,  startLng: -74.01,  endLat: -6.21,  endLng: 106.85, color: ['#00e5ff', '#06b6d4'] },
]

// Disaster zone rings — pulsing outward like a sonar ping
const RINGS = [
  { lat: 14.60,  lng: 120.98, maxR: 4,   propagationSpeed: 1.5, repeatPeriod: 900,  color: () => '#ef4444' },
  { lat: -6.21,  lng: 106.85, maxR: 3,   propagationSpeed: 1.2, repeatPeriod: 1100, color: () => '#f97316' },
  { lat: 27.72,  lng: 85.32,  maxR: 2.5, propagationSpeed: 1,   repeatPeriod: 1300, color: () => '#f59e0b' },
  { lat: 13.76,  lng: 100.50, maxR: 3,   propagationSpeed: 1.3, repeatPeriod: 1000, color: () => '#ef4444' },
]

// Point markers at disaster locations
const POINTS = [
  { lat: 14.60,  lng: 120.98, size: 0.4,  color: '#ef4444', label: 'M6.5 Earthquake · Manila' },
  { lat: -6.21,  lng: 106.85, size: 0.3,  color: '#f97316', label: 'Flood · Jakarta' },
  { lat: 27.72,  lng: 85.32,  size: 0.25, color: '#f59e0b', label: 'Earthquake · Nepal' },
  { lat: 13.76,  lng: 100.50, size: 0.3,  color: '#ef4444', label: 'Flood · Bangkok' },
]

export default function GlobeScene() {
  const ref = useRef<any>(null)

  useEffect(() => {
    if (!ref.current) return
    const ctrl = ref.current.controls()
    ctrl.autoRotate = true
    ctrl.autoRotateSpeed = 0.4
    ctrl.enableZoom = false
    ctrl.enablePan = false
    ref.current.pointOfView({ lat: 8, lng: 118, altitude: 1.9 }, 1200)
  }, [])

  const w = typeof window !== 'undefined' ? window.innerWidth  : 1200
  const h = typeof window !== 'undefined' ? window.innerHeight : 800

  return (
    <Globe
      ref={ref}
      width={w}
      height={h}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
      atmosphereColor="#06b6d4"
      atmosphereAltitude={0.28}
      backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
      arcsData={ARCS}
      arcColor="color"
      arcAltitude={0.35}
      arcStroke={0.6}
      arcDashLength={0.35}
      arcDashGap={0.15}
      arcDashAnimateTime={1800}
      ringsData={RINGS}
      ringColor="color"
      ringMaxRadius="maxR"
      ringPropagationSpeed="propagationSpeed"
      ringRepeatPeriod="repeatPeriod"
      pointsData={POINTS}
      pointColor="color"
      pointAltitude={0.015}
      pointRadius="size"
      pointResolution={8}
      pointLabel="label"
    />
  )
}
