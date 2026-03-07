'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const donations = [
  { member: 'Maria S.', pool: 'Manila Flood Relief', amount: '$25.00', time: 'now' },
  { member: 'Jose R.', pool: 'Cebu Typhoon Shield', amount: '$10.00', time: '2m ago' },
  { member: 'Ana C.', pool: 'Jakarta Quake Circle', amount: '$40.00', time: '6m ago' },
]

export default function RightConfigSidebar() {
  return (
    <aside className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Donation Notifications
            <Badge variant="outline">Incoming</Badge>
          </CardTitle>
          <CardDescription>Recent incoming contributions from member wallets in real time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {donations.map((donation) => (
            <div className="rounded-md border border-white/10 bg-white/5 p-3" key={`${donation.member}-${donation.time}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{donation.member}</p>
                  <p className="text-xs text-white/65">{donation.pool}</p>
                </div>
                <span className="text-sm font-semibold text-white">{donation.amount}</span>
              </div>
              <p className="mt-2 text-xs text-white/65">{donation.time}</p>
            </div>
          ))}
          <Button className="w-full" variant="secondary">
            View All Donations
          </Button>
        </CardContent>
      </Card>
    </aside>
  )
}
