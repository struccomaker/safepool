'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DISASTER_PINS } from '@/lib/disaster-pins'

export default function LeftConfigSidebar() {
  const [brazilEqActive, setBrazilEqActive] = useState(false)

  useEffect(() => {
    const onEq = () => {
      setBrazilEqActive(true)
      window.setTimeout(() => setBrazilEqActive(false), 18000)
    }
    window.addEventListener('safepool:earthquake-demo', onEq)
    return () => window.removeEventListener('safepool:earthquake-demo', onEq)
  }, [])

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
          <CardDescription>Verified signals from disaster data providers relevant to active pools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {brazilEqActive && (
            <div
              className="rounded-md border-2 p-3 animate-in fade-in slide-in-from-top-2 duration-300"
              style={{
                borderColor: 'rgba(239,68,68,0.7)',
                background: 'rgba(239,68,68,0.08)',
                animation: 'eq-entry-pulse 1s ease-in-out infinite, enter 0.3s ease',
              }}
            >
              <style>{`
                @keyframes eq-entry-pulse {
                  0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); border-color: rgba(239,68,68,0.7); }
                  50%     { box-shadow: 0 0 12px 2px rgba(239,68,68,0.35); border-color: rgba(239,68,68,1); }
                }
              `}</style>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">M7.4 Earthquake</p>
                  <p className="text-xs text-white/65">Acre, Brazil</p>
                </div>
                <Badge className="border-red-500/60 bg-red-500/20 text-red-400 animate-pulse" variant="outline">
                  TRIGGERED
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                <span>USGS · 283 donors</span>
                <span className="text-red-400">Critical</span>
              </div>
            </div>
          )}

          {DISASTER_PINS.map((pin) => (
            <div className="rounded-md border border-white/10 bg-white/5 p-3" key={pin.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{pin.eventType}</p>
                  <p className="text-xs text-white/65">{pin.location}</p>
                </div>
                <Badge
                  className="bg-white/10 text-white"
                  variant="outline"
                  style={{ borderColor: pin.status === 'Triggered' ? 'rgba(239,68,68,0.5)' : undefined }}
                >
                  {pin.status}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                <span>{pin.source}</span>
                <span style={{ color: pin.dotColor }}>{pin.severity}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </aside>
  )
}
