// Server Component — global ClickHouse analytics dashboard
import ContributionTimeline from '@/components/ContributionTimeline'

export default function AnalyticsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Analytics</h1>
      <p className="text-white/50 mb-8">Real-time data from ClickHouse materialized views</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Total Pooled (all time)', value: '$0', sub: 'across all pools' },
          { label: 'Payouts Sent', value: '0', sub: 'ILP transactions' },
          { label: 'Avg Payout Latency', value: '—', sub: 'disaster → payment' },
          { label: 'Active Members', value: '0', sub: 'across all pools' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="text-2xl font-bold text-green-400">{stat.value}</div>
            <div className="text-sm font-medium mt-1">{stat.label}</div>
            <div className="text-xs text-white/30 mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Contribution trend chart — all pools */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Global Contribution Trend</h2>
        <ContributionTimeline />
      </div>

      {/* Disaster heatmap placeholder */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Disaster Heatmap</h2>
        <div className="text-white/30 text-sm">
          Geographic heatmap from <code>disaster_heatmap</code> materialized view — powered by ClickHouse.
        </div>
        {/* TODO: render Leaflet heatmap layer with data from /api/analytics/disaster-map */}
      </div>
    </div>
  )
}
