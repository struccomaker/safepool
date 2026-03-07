'use client'

import { useEffect, useState } from 'react'

interface DisasterTriggerAlertProps {
  poolId: string
}

interface TriggerStatus {
  triggered: boolean
  disasterName?: string
  payoutsCount?: number
}

export default function DisasterTriggerAlert({ poolId }: DisasterTriggerAlertProps) {
  const [status, setStatus] = useState<TriggerStatus | null>(null)

  useEffect(() => {
    // Poll for recent trigger events for this pool
    const check = async () => {
      try {
        const res = await fetch(`/api/disasters/check/${poolId}`)
        if (res.ok) {
          const data = await res.json() as TriggerStatus
          setStatus(data)
        }
      } catch {
        // Silently ignore
      }
    }

    check()
    const interval = setInterval(check, 10_000)
    return () => clearInterval(interval)
  }, [poolId])

  if (!status?.triggered) return null

  return (
    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/40 rounded-xl flex items-center gap-4">
      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
      <div>
        <div className="font-semibold text-red-400">Disaster Trigger Activated</div>
        <div className="text-sm text-white/60 mt-0.5">
          {status.disasterName} — {status.payoutsCount ?? 0} payouts sent via Interledger
        </div>
      </div>
    </div>
  )
}
