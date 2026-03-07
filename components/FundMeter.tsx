'use client'

import { useEffect, useState } from 'react'

interface FundMeterProps {
  poolId: string
  target: number
  currency: string
}

export default function FundMeter({ poolId, target, currency }: FundMeterProps) {
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    fetch(`/api/analytics/fund-balance?poolId=${poolId}`)
      .then((r) => r.json())
      .then((rows: Array<{ total_in: number }>) => {
        const total = rows.reduce((s, r) => s + Number(r.total_in), 0)
        setBalance(total)
      })
      .catch(() => {})

    // Refresh every 10s
    const interval = setInterval(() => {
      fetch(`/api/analytics/fund-balance?poolId=${poolId}`)
        .then((r) => r.json())
        .then((rows: Array<{ total_in: number }>) => {
          const total = rows.reduce((s, r) => s + Number(r.total_in), 0)
          setBalance(total)
        })
        .catch(() => {})
    }, 10_000)

    return () => clearInterval(interval)
  }, [poolId])

  const pct = target > 0 ? Math.min((balance / target) * 100, 100) : 0
  const color = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="font-semibold mb-3">Fund Balance</h3>

      {/* Gauge bar */}
      <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex justify-between text-sm">
        <span className="font-mono font-bold" style={{ color }}>
          ${balance.toFixed(2)} {currency}
        </span>
        <span className="text-white/40">cap ${target}</span>
      </div>

      <div className="mt-2 text-xs text-white/30">{pct.toFixed(1)}% funded</div>
    </div>
  )
}
