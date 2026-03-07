'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DISASTER_PINS } from '@/lib/disaster-pins'
import { getBrazilStatus, type BrazilStatus } from '@/lib/brazil-eq-state'

const statusStyle: Record<NonNullable<BrazilStatus>, { border: string; bg: string; text: string; badge: string }> = {
  'Triggered':   { border: 'rgba(239,68,68,0.7)',   bg: 'rgba(239,68,68,0.08)',   text: 'text-red-400',   badge: 'border-red-500/60 bg-red-500/20 text-red-400' },
  'Payout Given':{ border: 'rgba(245,158,11,0.7)',  bg: 'rgba(245,158,11,0.06)',  text: 'text-amber-400', badge: 'border-amber-500/60 bg-amber-500/20 text-amber-300' },
  'Monitoring':  { border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.03)', text: 'text-white/60',  badge: 'bg-white/10 text-white' },
}

export default function LeftConfigSidebar() {
  const [brazilStatus, setBrazilStatus] = useState<BrazilStatus>(getBrazilStatus)

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

  const brazil = brazilStatus ? statusStyle[brazilStatus] : null

  const focusEpicentre = (lat: number, lng: number) => {
    window.dispatchEvent(new CustomEvent('safepool:focus-epicentre', { detail: { lat, lng } }))
  }

  return (
    <aside className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Disaster Updates
            <Badge className="gap-1 border-0 bg-white/10 text-white" variant="outline">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              Live
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Brazil earthquake entry — persists through all phases */}
          {brazil && (
            <>
              <style>{`
                @keyframes eq-entry-pulse {
                  0%,100% { box-shadow: none; }
                  50%     { box-shadow: 0 0 10px 2px rgba(239,68,68,0.3); }
                }
              `}</style>
              <div
                className="rounded-md border-2 p-3 animate-in fade-in slide-in-from-top-2 duration-300 cursor-pointer hover:brightness-125 transition-all"
                style={{
                  borderColor: brazil.border,
                  background: brazil.bg,
                  animation: brazilStatus === 'Triggered'
                    ? 'eq-entry-pulse 1s ease-in-out infinite'
                    : undefined,
                }}
                onClick={() => focusEpicentre(-9.19, -70.81)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">Earthquake</p>
                    <p className="text-xs text-white/65">Acre, Brazil</p>
                  </div>
                  <Badge
                    className={`${brazil.badge} ${brazilStatus === 'Triggered' ? 'animate-pulse' : ''}`}
                    variant="outline"
                  >
                    {brazilStatus}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                  <span>283 donors</span>
                  <span className={brazil.text}>M7.4</span>
                </div>
              </div>
            </>
          )}

          {/* Existing disaster pins */}
          {DISASTER_PINS.map((pin) => (
            <div
              className="rounded-md border border-white/10 bg-white/5 p-3 cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all"
              key={pin.id}
              onClick={() => focusEpicentre(pin.coords[1], pin.coords[0])}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{pin.eventType}</p>
                  <p className="text-xs text-white/65">{pin.location}</p>
                </div>
                <Badge className="bg-white/10 text-white" variant="outline">
                  {pin.status}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                <span>{pin.donorCount} donors</span>
                <span style={{ color: pin.dotColor }}>{pin.severity}</span>
              </div>
            </div>
          ))}

        </CardContent>
      </Card>
    </aside>
  )
}
