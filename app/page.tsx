'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import GlobeCenterPanel from '@/components/dashboard/GlobeCenterPanel'
import LeftConfigSidebar from '@/components/dashboard/LeftConfigSidebar'
import RightConfigSidebar from '@/components/dashboard/RightConfigSidebar'
import TopNavigationMenu from '@/components/dashboard/TopNavigationMenu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

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

export default function DashboardPage() {
  return (
    <div id="home" className="relative h-[100dvh] w-full overflow-hidden bg-[#050508] text-white">
      <GlobeCenterPanel />

      <div className="pointer-events-none absolute inset-0 z-40 hidden lg:block">
        <div className="pointer-events-auto absolute right-4 top-4">
          <TopNavigationMenu isAuthenticated={false} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-30 hidden lg:block">
        <div className="pointer-events-auto absolute left-4 top-20 h-[calc(100dvh-6rem)] w-[320px] overflow-y-auto">
          <LeftConfigSidebar />
        </div>
        <div className="pointer-events-auto absolute right-4 top-20 h-[calc(100dvh-6rem)] w-[320px] overflow-y-auto">
          <RightConfigSidebar />
        </div>
      </div>

      <div className="absolute inset-x-3 bottom-3 z-30 grid gap-3 lg:hidden">
        <Card id="stats" className="border-white/20 bg-black/70 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Disaster Updates</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/75">Open on desktop to view full live disaster sidebar controls.</CardContent>
        </Card>
        <Card id="how-it-works" className="border-white/20 bg-black/70 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Donation Notifications</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/75">Open on desktop to view incoming donation notifications panel.</CardContent>
        </Card>
        <div id="highlights" className="sr-only" />
        <div id="cta" className="sr-only" />
      </div>
    </div>
  )
}

function DashboardContent() {
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false)
  const [isGlobeReady, setIsGlobeReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const searchParams = useSearchParams()

  // Check auth state on mount for flicker-free rendering
  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (mounted) {
          setIsAuthenticated(Boolean(user))
        }
      } catch {
        // Silently fail — TopNavigationMenu will handle its own auth hydration
      }
    }

    void checkAuth()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#050508] text-white">
      <GlobeCenterPanel onDrilldownChange={setIsDrilldownOpen} onGlobeReadyChange={setIsGlobeReady} />

      {!isGlobeReady && <PageLoader overlay />}

      {isGlobeReady && (
        <div className="pointer-events-none absolute inset-0 z-40 hidden lg:block">
          <div className="pointer-events-auto absolute right-4 top-4">
            <TopNavigationMenu isAuthenticated={isAuthenticated} />
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
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DashboardContent />
    </Suspense>
  )
}
