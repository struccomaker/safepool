'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const disasterFeed = [
  {
    type: 'Earthquake',
    location: 'Metro Manila, PH',
    severity: 'M6.4',
    source: 'USGS',
    status: 'Triggered',
  },
  {
    type: 'Flood',
    location: 'Jakarta, ID',
    severity: 'Severe',
    source: 'GDACS',
    status: 'Monitoring',
  },
  {
    type: 'Tropical Storm',
    location: 'Cebu, PH',
    severity: 'Category 2',
    source: 'OWM',
    status: 'Monitoring',
  },
]

export default function LeftConfigSidebar() {
  return (
    <aside className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Disaster Updates
            <Badge variant="outline">Live Feed</Badge>
          </CardTitle>
          <CardDescription>Verified signals from disaster data providers relevant to active pools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {disasterFeed.map((event) => (
            <div className="rounded-md border border-white/10 bg-white/5 p-3" key={`${event.type}-${event.location}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{event.type}</p>
                  <p className="text-xs text-white/65">{event.location}</p>
                </div>
                <Badge className="bg-white/10 text-white" variant="outline">
                  {event.status}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                <span>{event.source}</span>
                <span>{event.severity}</span>
              </div>
            </div>
          ))}
          <Button className="w-full" variant="secondary">
            Open Disaster Console
          </Button>
        </CardContent>
      </Card>
    </aside>
  )
}
