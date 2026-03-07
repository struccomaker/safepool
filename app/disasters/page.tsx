// Server Component — live disaster feed + manual trigger for demo
import DisasterMap from '@/components/DisasterMap'
import type { DisasterEvent } from '@/types'

async function getDisasters(): Promise<DisasterEvent[]> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/disasters`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Failed')
    return res.json()
  } catch {
    return []
  }
}

const SEVERITY_COLOR: Record<string, string> = {
  low: 'text-green-400',
  medium: 'text-amber-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
}

export default async function DisastersPage() {
  const disasters = await getDisasters()

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Live Disaster Feed</h1>
          <p className="text-white/50 mt-1">USGS + GDACS real-time monitoring</p>
        </div>
      </div>

      {/* Leaflet map */}
      <div className="mb-8 rounded-xl overflow-hidden border border-white/10" style={{ height: 400 }}>
        <DisasterMap disasters={disasters} />
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {disasters.length === 0 && (
          <div className="text-center py-12 text-white/30">No recent events.</div>
        )}
        {disasters.map((d) => (
          <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-semibold capitalize">{d.disaster_type}</span>
                <span className={`text-sm font-medium capitalize ${SEVERITY_COLOR[d.severity] ?? 'text-white/40'}`}>
                  {d.severity}
                </span>
                {d.magnitude > 0 && <span className="text-sm text-white/40">M{d.magnitude}</span>}
              </div>
              <div className="text-sm text-white/50 mt-1">{d.location_name}</div>
            </div>
            <div className="text-xs text-white/30 text-right">
              <div>{d.source.toUpperCase()}</div>
              <div>{new Date(d.occurred_at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
