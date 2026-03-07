// Server Component — pool detail with FundMeter + charts
import { notFound } from 'next/navigation'
import Link from 'next/link'
import FundMeter from '@/components/FundMeter'
import ContributionTimeline from '@/components/ContributionTimeline'
import PayoutTracker from '@/components/PayoutTracker'
import DisasterTriggerAlert from '@/components/DisasterTriggerAlert'
import type { Pool } from '@/types'

async function getPool(id: string): Promise<Pool | null> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/pools/${id}`, { cache: 'no-store' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error('Failed to fetch pool')
    return res.json()
  } catch {
    // Mock fallback
    return {
      id,
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
    }
  }
}

export default async function PoolDetailPage({ params }: { params: { id: string } }) {
  const pool = await getPool(params.id)
  if (!pool) notFound()

  const rules = JSON.parse(pool.trigger_rules) as { disasterTypes: string[]; radius_km: number; minMagnitude: number }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <DisasterTriggerAlert poolId={pool.id} />

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">{pool.name}</h1>
          <p className="text-white/50">{pool.description}</p>
        </div>
        <div className="flex gap-3">
          <Link href={`/pools/${pool.id}/contribute`} className="px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg transition-colors">
            Contribute
          </Link>
          <Link href={`/pools/${pool.id}/governance`} className="px-5 py-2 border border-white/20 hover:border-white/40 rounded-lg transition-colors">
            Governance
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <ContributionTimeline poolId={pool.id} />
          <PayoutTracker poolId={pool.id} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <FundMeter poolId={pool.id} target={pool.payout_cap} currency={pool.currency} />

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Trigger Rules</h3>
            <div className="text-sm text-white/60 space-y-1">
              <div>Types: {rules.disasterTypes.join(', ')}</div>
              <div>Min magnitude: {rules.minMagnitude}</div>
              <div>Radius: {rules.radius_km} km</div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Distribution</h3>
            <div className="text-sm text-white/60 capitalize">
              {pool.distribution_model.replace('_', ' ')}
            </div>
            <div className="text-sm text-white/60">
              Cap: ${pool.payout_cap} {pool.currency}
            </div>
          </div>

          <div className="flex gap-3">
            <Link href={`/pools/${pool.id}/members`} className="flex-1 text-center py-2 border border-white/10 hover:border-white/30 rounded-lg text-sm transition-colors">
              Members
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
