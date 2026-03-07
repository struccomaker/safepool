import Link from 'next/link'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

async function getData() {
  const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  try {
    const [balance, disasters] = await Promise.all([
      fetch(`${base}/api/analytics/fund-balance?poolId=${GLOBAL_POOL_ID}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${base}/api/disasters?limit=5`, { cache: 'no-store' }).then(r => r.json()),
    ])
    const totalFunds = (balance ?? []).reduce((s: number, b: any) => s + Number(b.total_in ?? 0), 0)
    const totalContributions = (balance ?? []).reduce((s: number, b: any) => s + Number(b.contribution_count ?? 0), 0)
    return { totalFunds, totalContributions, disasters: disasters ?? [] }
  } catch {
    return { totalFunds: 0, totalContributions: 0, disasters: [] }
  }
}

export default async function DashboardPage() {
  const { totalFunds, totalContributions, disasters } = await getData()

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
        <p className="text-gray-400">Global pool status and recent activity</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Total Pooled', value: `$${totalFunds.toFixed(2)}`, color: 'text-green-400' },
          { label: 'Total Contributions', value: totalContributions.toString(), color: 'text-blue-400' },
          { label: 'Disasters Tracked', value: disasters.length.toString(), color: 'text-amber-400' },
          { label: 'Avg Payout Time', value: '2.3s', color: 'text-purple-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-gray-400 text-sm mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Global Pool card */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Global Pool</h2>
            <Link href="/pool" className="text-green-400 text-sm hover:underline">View details →</Link>
          </div>
          <div className="bg-white/5 border border-white/10 hover:border-green-500/30 rounded-xl p-6 transition-colors">
            <div className="font-semibold text-lg mb-1">SafePool Global Fund</div>
            <div className="text-gray-400 text-sm mb-4">
              One shared emergency fund for all members worldwide.
            </div>
            <div className="flex items-center justify-between">
              <span className="text-green-400 font-mono font-semibold text-lg">
                ${totalFunds.toFixed(2)} USD
              </span>
              <Link
                href="/contribute"
                className="px-4 py-1.5 bg-green-500 hover:bg-green-400 text-black text-sm font-semibold rounded-lg transition-colors"
              >
                Contribute
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Disasters */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Disasters</h2>
            <Link href="/disasters" className="text-green-400 text-sm hover:underline">View all →</Link>
          </div>
          <div className="space-y-3">
            {(disasters as any[]).slice(0, 5).map((d: any) => (
              <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium capitalize">{d.disaster_type} — {d.location_name}</div>
                    <div className="text-gray-400 text-sm mt-0.5">M{d.magnitude} · {d.severity}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    d.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    d.severity === 'high'     ? 'bg-orange-500/20 text-orange-400' :
                                                'bg-yellow-500/20 text-yellow-400'
                  }`}>{d.severity}</span>
                </div>
              </div>
            ))}
            {disasters.length === 0 && (
              <div className="text-gray-500 text-sm py-8 text-center border border-dashed border-white/10 rounded-xl">
                No disasters recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
