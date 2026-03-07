import Link from 'next/link'

async function getData() {
  const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  try {
    const [pools, disasters] = await Promise.all([
      fetch(`${base}/api/pools`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${base}/api/disasters?limit=5`, { cache: 'no-store' }).then(r => r.json()),
    ])
    return { pools: pools ?? [], disasters: disasters ?? [] }
  } catch {
    return { pools: [], disasters: [] }
  }
}

export default async function DashboardPage() {
  const { pools, disasters } = await getData()

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
        <p className="text-gray-400">Your pools and recent activity</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Active Pools', value: pools.length, color: 'text-green-400' },
          { label: 'Disasters Tracked', value: disasters.length, color: 'text-amber-400' },
          { label: 'Total Contributed', value: '$0.00', color: 'text-blue-400' },
          { label: 'Payouts Received', value: '$0.00', color: 'text-purple-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-gray-400 text-sm mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Pools */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Active Pools</h2>
            <Link href="/pools" className="text-green-400 text-sm hover:underline">View all →</Link>
          </div>
          <div className="space-y-3">
            {(pools as any[]).slice(0, 5).map((pool: any) => (
              <Link key={pool.id} href={`/pools/${pool.id}`}>
                <div className="bg-white/5 border border-white/10 hover:border-green-500/30 rounded-xl p-4 cursor-pointer transition-colors">
                  <div className="font-medium">{pool.name}</div>
                  <div className="text-gray-400 text-sm mt-1 truncate">{pool.description}</div>
                  <div className="flex gap-3 mt-2">
                    <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded">
                      {pool.distribution_model}
                    </span>
                    <span className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded">
                      {pool.currency} {pool.contribution_amount}/mo
                    </span>
                  </div>
                </div>
              </Link>
            ))}
            {pools.length === 0 && (
              <div className="text-gray-500 text-sm py-8 text-center border border-dashed border-white/10 rounded-xl">
                No pools yet.{' '}
                <Link href="/pools/create" className="text-green-400 hover:underline">Create one →</Link>
              </div>
            )}
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
