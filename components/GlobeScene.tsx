'use client'

import { useEffect, useRef } from 'react'

// react-globe.gl is a client-only Three.js package — imported dynamically
export default function GlobeScene() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // TODO: initialise globe using react-globe.gl imperative API
    // import('react-globe.gl').then(({ default: Globe }) => {
    //   const g = Globe()(containerRef.current!)
    //     .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
    //     .backgroundColor('#050508')
    //     .atmosphereColor('#06b6d4')
    //   return () => { g._destructor() }
    // })
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #050508 100%)' }}
    >
      {/* 3D Globe renders here once react-globe.gl is wired up */}
    </div>
  )
}
