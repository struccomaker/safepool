'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#06b6d4']

export default function AnalyticsPage() {
  const [balances, setBalances] = useState<any[]>([])
  const [trend, setTrend] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics/fund-balance').then(r => r.json()),
      fetch('/api/analytics/contribution-trend').then(r => r.json()),
      fetch('/api/analytics/payout-stats').then(r => r.json()),
    ]).then(([b, t, p]) => {
      setBalances(b ?? [])
      setTrend((t ?? []).sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(-30))
      setPayouts(p ?? [])
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Analytics</h1>
      <p className="text-gray-400 mb-8">Real-time data from ClickHouse materialized views</p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Funds Pooled', value: `$${balances.reduce((s, b) => s + Number(b.balance ?? b.total_in ?? 0), 0).toFixed(2)}` },
          { label: 'Total Contributions', value: balances.reduce((s, b) => s + Number(b.count ?? 0), 0).toString() },
          { label: 'Pools Tracked', value: balances.length.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
            <div className="text-2xl font-bold text-green-400">{value}</div>
            <div className="text-gray-400 text-sm mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Contribution trend */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm text-gray-400 mb-4 font-medium">Daily Contributions (30d)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} itemStyle={{ color: '#22c55e' }} labelStyle={{ color: '#aaa' }} />
              <Bar dataKey="daily_total" fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pool balances pie */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm text-gray-400 mb-4 font-medium">Pool Balances</h3>
          {balances.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={balances}
                  dataKey="balance"
                  nameKey="pool_id"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ percent }: any) => `${(percent * 100).toFixed(0)}%`}
                >
                  {balances.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-gray-500 text-sm text-center py-16">No data yet</div>
          )}
        </div>
      </div>

      {/* Payout stats table */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm text-gray-400 mb-4 font-medium">Payout Statistics by Disaster Type</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 pr-4">Disaster Type</th>
                <th className="text-right py-2 pr-4">Payouts</th>
                <th className="text-right py-2 pr-4">Total Paid</th>
                <th className="text-right py-2">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((row: any, i: number) => (
                <tr key={i} className="border-b border-white/5 text-gray-300">
                  <td className="py-2 pr-4 capitalize">{row.disaster_type}</td>
                  <td className="text-right py-2 pr-4">{row.payout_count}</td>
                  <td className="text-right py-2 pr-4 text-green-400">${Number(row.total_paid).toFixed(2)}</td>
                  <td className="text-right py-2 text-blue-400">{Number(row.avg_latency_seconds).toFixed(1)}s</td>
                </tr>
              ))}
              {payouts.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-gray-500">No payouts yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
