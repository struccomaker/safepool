// Server Component — lists all active pools from ClickHouse
import Link from 'next/link'
import type { Pool } from '@/types'

async function getPools(): Promise<Pool[]> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/pools`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Failed to fetch pools')
    return res.json()
  } catch {
    // Mock fallback while backend is being built
    return [
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
  }
}

export default async function PoolsPage() {
  const pools = await getPools()

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Pools</h1>
          <p className="text-white/50 mt-1">{pools.length} active community pools</p>
        </div>
        <Link
          href="/pools/create"
          className="px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg transition-colors"
        >
          + Create Pool
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pools.map((pool) => {
          const rules = JSON.parse(pool.trigger_rules) as { disasterTypes: string[]; radius_km: number }
          return (
            <Link
              key={pool.id}
              href={`/pools/${pool.id}`}
              className="block bg-white/5 border border-white/10 rounded-xl p-6 hover:border-green-500/40 hover:bg-white/8 transition-all"
            >
              <h2 className="font-semibold text-lg mb-1">{pool.name}</h2>
              <p className="text-sm text-white/50 mb-4">{pool.description}</p>
              <div className="flex gap-4 text-xs text-white/40">
                <span className="capitalize">{rules.disasterTypes.join(', ')}</span>
                <span>{rules.radius_km}km radius</span>
                <span className="capitalize">{pool.distribution_model.replace('_', ' ')}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-green-400 font-mono font-semibold">
                  ${pool.contribution_amount} {pool.currency}/{pool.contribution_frequency.replace('ly', '')}
                </span>
                <span className="text-xs text-white/30">Join →</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
