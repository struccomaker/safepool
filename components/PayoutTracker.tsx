'use client'

import { useEffect, useState } from 'react'
import type { Payout } from '@/types'

interface PayoutTrackerProps {
  poolId: string
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-amber-400',
  processing: 'text-blue-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
}

export default function PayoutTracker({ poolId }: PayoutTrackerProps) {
  const [payouts, setPayouts] = useState<Payout[]>([])

  useEffect(() => {
    fetch(`/api/analytics/payout-stats?poolId=${poolId}`)
      .then((r) => r.json())
      .then((data: Payout[]) => setPayouts(data))
      .catch(() => {})

    const interval = setInterval(() => {
      fetch(`/api/analytics/payout-stats?poolId=${poolId}`)
        .then((r) => r.json())
        .then((data: Payout[]) => setPayouts(data))
        .catch(() => {})
    }, 5_000)

    return () => clearInterval(interval)
  }, [poolId])

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="font-semibold mb-4">Payout History</h3>

      {payouts.length === 0 && (
        <p className="text-white/30 text-sm">No payouts yet. Payouts trigger automatically when a disaster is detected.</p>
      )}

      <div className="space-y-3">
        {payouts.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div>
              <div className="text-sm font-mono truncate max-w-xs">{p.member_id}</div>
              <div className="text-xs text-white/30">{new Date(p.payout_at).toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-green-400 font-mono">${p.amount} {p.currency}</div>
              <div className={`text-xs capitalize ${STATUS_STYLE[p.status] ?? 'text-white/40'}`}>{p.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
