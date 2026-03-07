'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DISASTER_PINS } from '@/lib/disaster-pins'

export default function LeftConfigSidebar() {
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
