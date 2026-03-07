// Server Component — global pool detail
import Link from 'next/link'
import FundMeter from '@/components/FundMeter'
import ContributionTimeline from '@/components/ContributionTimeline'
import PayoutTracker from '@/components/PayoutTracker'
import DisasterTriggerAlert from '@/components/DisasterTriggerAlert'
import { GLOBAL_POOL_ID, GLOBAL_POOL_CONFIG } from '@/lib/global-pool'

export default function PoolPage() {
  const { name, description, currency, payout_cap, trigger_rules } = GLOBAL_POOL_CONFIG

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <DisasterTriggerAlert poolId={GLOBAL_POOL_ID} />

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">{name}</h1>
          <p className="text-white/50">{description}</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/contribute"
            className="px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg transition-colors"
          >
            Contribute
          </Link>
          <Link
            href="/governance"
            className="px-5 py-2 border border-white/20 hover:border-white/40 rounded-lg transition-colors"
          >
            Governance
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          <ContributionTimeline poolId={GLOBAL_POOL_ID} />
          <PayoutTracker poolId={GLOBAL_POOL_ID} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <FundMeter poolId={GLOBAL_POOL_ID} target={payout_cap} currency={currency} />

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Trigger Rules</h3>
            <div className="text-sm text-white/60 space-y-1">
              <div>Types: {trigger_rules.disasterTypes.join(', ')}</div>
              <div>Min magnitude: {trigger_rules.minMagnitude}</div>
              <div>Radius: {trigger_rules.radius_km} km</div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Distribution</h3>
            <div className="text-sm text-white/60 capitalize">Equal split among affected members</div>
            <div className="text-sm text-white/60">Cap: ${payout_cap} {currency} per member</div>
          </div>

          <Link
            href="/members"
            className="block text-center py-2 border border-white/10 hover:border-white/30 rounded-lg text-sm transition-colors"
          >
            View Members
          </Link>
        </div>
      </div>
    </div>
  )
}
