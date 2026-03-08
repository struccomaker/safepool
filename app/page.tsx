'use client'

import { Suspense, useEffect, useState } from 'react'
import GlobeCenterPanel from '@/components/dashboard/GlobeCenterPanel'
import LeftConfigSidebar from '@/components/dashboard/LeftConfigSidebar'
import RightConfigSidebar from '@/components/dashboard/RightConfigSidebar'
import TopNavigationMenu from '@/components/dashboard/TopNavigationMenu'
import EarthquakeDemoOverlay from '@/components/EarthquakeDemoOverlay'
import TildeHelpPanel from '@/components/dashboard/TildeHelpPanel'
import { MiniGodzillaBadge } from '@/components/dashboard/TopNavigationMenu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

function PageLoader({ overlay = false }: { overlay?: boolean }) {
  const [progress, setProgress] = useState(10)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return 92
        return current + 5
      })
    }, 220)

    return () => window.clearInterval(interval)
  }, [])

  const containerClass = overlay
    ? 'pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm'
    : 'relative h-[100dvh] w-full bg-[#050508] flex items-center justify-center'

  return (
    <div className={containerClass}>
      <div className="w-[340px] rounded-xl border border-white/20 bg-black/85 p-5 text-white">
        <p className="mb-3 text-sm text-white/75">Loading global response dashboard...</p>
        <Progress value={progress} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false)
  const [isGlobeReady, setIsGlobeReady] = useState(false)
  const [showGodzilla, setShowGodzilla] = useState(true)

  useEffect(() => {
    const hide = () => setShowGodzilla(false)
    const show = () => setShowGodzilla(true)
    window.addEventListener('safepool:godzilla-spawned', hide)
    window.addEventListener('safepool:godzilla-cleared', show)
    return () => {
      window.removeEventListener('safepool:godzilla-spawned', hide)
      window.removeEventListener('safepool:godzilla-cleared', show)
    }
  }, [])

  return (
    <Suspense fallback={<PageLoader />}>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-[#050508] text-white">
        <GlobeCenterPanel onDrilldownChange={setIsDrilldownOpen} onGlobeReadyChange={setIsGlobeReady} />
        <EarthquakeDemoOverlay />
        <TildeHelpPanel />

        {isGlobeReady && (
          <div className="pointer-events-auto absolute left-4 top-4 z-40 flex items-center gap-2">
            <div className="w-14 h-14 flex items-center justify-center">
              {showGodzilla && <MiniGodzillaBadge />}
            </div>
            <span className="font-mono text-sm font-bold tracking-[0.2em] text-white/85">SAFEPOOL</span>
          </div>
        )}

        {!isGlobeReady && <PageLoader overlay />}

        {isGlobeReady && (
          <div className="pointer-events-none absolute inset-0 z-40 hidden lg:block">
            <div className="pointer-events-auto absolute right-4 top-4">
              <TopNavigationMenu />
            </div>
          </div>
        )}

        {isGlobeReady && !isDrilldownOpen && (
          <div className="pointer-events-none absolute inset-0 z-30 hidden lg:block">
            <div className="pointer-events-auto absolute left-4 top-20 h-[calc(100dvh-6rem)] w-[320px] overflow-y-auto">
              <LeftConfigSidebar />
            </div>
            <div className="pointer-events-auto absolute right-4 top-20 h-[calc(100dvh-6rem)] w-[320px] overflow-y-auto">
              <RightConfigSidebar />
            </div>
          </div>
        )}

        {isGlobeReady && !isDrilldownOpen && (
          <div className="absolute inset-x-3 bottom-3 z-30 grid gap-3 lg:hidden">
            <Card className="border-white/20 bg-black/70 backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Disaster Updates</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-white/75">Open on desktop to view full live disaster sidebar controls.</CardContent>
            </Card>
            <Card className="border-white/20 bg-black/70 backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Donation Notifications</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-white/75">Open on desktop to view incoming donation notifications panel.</CardContent>
            </Card>
          </div>
        )}
      </div>
    </Suspense>
  )
}
