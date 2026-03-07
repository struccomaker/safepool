// Server Component — reads session + fetches user pools from ClickHouse
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import type { Pool } from '@/types'

// TODO: replace mock with real ClickHouse query via lib/clickhouse.ts
const MOCK_POOLS: Pool[] = [
  {
    id: '1',
    name: 'Manila Flood Relief',
    description: 'Covers Metro Manila members for flood + earthquake events.',
    created_by: 'user-1',
    distribution_model: 'equal_split',
    contribution_frequency: 'monthly',
    contribution_amount: 10,
    currency: 'USD',
    trigger_rules: JSON.stringify({ minMagnitude: 6.0, disasterTypes: ['earthquake', 'flood'], radius_km: 50 }),
    governance_rules: JSON.stringify({ quorum_pct: 50, vote_threshold: 60 }),
    payout_cap: 500,
    created_at: new Date().toISOString(),
    is_active: 1,
  },
]

export default async function DashboardPage() {
  const session = await getServerSession()

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-white/50 mt-1">Welcome back, {session?.user?.name ?? 'Guest'}</p>
        </div>
        <Link
          href="/pools/create"
          className="px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg transition-colors"
        >
          + New Pool
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { label: 'Your Pools', value: MOCK_POOLS.length, color: 'text-green-400' },
          { label: 'Total Contributed', value: '$30.00', color: 'text-cyan-400' },
          { label: 'Payouts Received', value: '$0.00', color: 'text-amber-400' },
        ].map((card) => (
          <div key={card.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-sm text-white/40 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Pool list */}
      <h2 className="text-xl font-semibold mb-4">Your Pools</h2>
      <div className="space-y-3">
        {MOCK_POOLS.map((pool) => (
          <Link
            key={pool.id}
            href={`/pools/${pool.id}`}
            className="block bg-white/5 border border-white/10 rounded-xl p-5 hover:border-green-500/40 hover:bg-white/8 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{pool.name}</div>
                <div className="text-sm text-white/40 mt-1">{pool.description}</div>
              </div>
              <div className="text-right">
                <div className="text-green-400 font-mono">${pool.contribution_amount}/mo</div>
                <div className="text-xs text-white/30 mt-1">{pool.distribution_model}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
