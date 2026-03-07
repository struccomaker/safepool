import { Card, CardContent } from '@/components/ui/card'

const STATS = [
  { label: 'Total pooled', value: '$0', tone: 'text-green-400' },
  { label: 'Active pools', value: '0', tone: 'text-cyan-400' },
  { label: 'Avg payout time', value: '~2s', tone: 'text-amber-400' },
  { label: 'Disasters monitored', value: '24/7', tone: 'text-red-400' },
]

export default function StatsSection() {
  return (
    <section id="stats" className="mx-auto max-w-6xl px-6 py-12">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className={`text-3xl font-bold ${stat.tone}`}>{stat.value}</div>
              <p className="mt-2 text-sm text-white/60">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
