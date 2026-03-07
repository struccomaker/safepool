'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint {
  date: string
  total: number
  count: number
}

interface ContributionTimelineProps {
  poolId?: string
}

export default function ContributionTimeline({ poolId }: ContributionTimelineProps) {
  const [data, setData] = useState<DataPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = poolId
      ? `/api/analytics/contribution-trend?poolId=${poolId}`
      : '/api/analytics/contribution-trend'

    fetch(url)
      .then((r) => r.json())
      .then((rows: DataPoint[]) => {
        setData(rows)
        setLoading(false)
      })
      .catch(() => {
        // Mock data while backend isn't connected
        setData(
          Array.from({ length: 14 }, (_, i) => ({
            date: new Date(Date.now() - (13 - i) * 86400000).toISOString().split('T')[0],
            total: Math.random() * 200 + 50,
            count: Math.floor(Math.random() * 10 + 1),
          }))
        )
        setLoading(false)
      })
  }, [poolId])

  if (loading) return <div className="h-48 flex items-center justify-center text-white/30 text-sm">Loading…</div>

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="font-semibold mb-4">Contribution Trend</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="green-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8 }}
            labelStyle={{ color: '#aaa' }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, 'Total']}
          />
          <Area type="monotone" dataKey="total" stroke="#22c55e" strokeWidth={2} fill="url(#green-grad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
