import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const HIGHLIGHTS = [
  {
    title: 'Interledger-native payouts',
    description: 'Every contribution and payout is designed around Open Payments testnet wallet flows.',
  },
  {
    title: 'ClickHouse live analytics',
    description: 'Materialized views power contribution trends, balances, and payout latency dashboards.',
  },
  {
    title: 'Disaster API aggregation',
    description: 'USGS, GDACS, and weather feeds are combined to reduce false positives before trigger events.',
  },
]

export default function HighlightsSection() {
  return (
    <section id="highlights" className="mx-auto max-w-6xl px-6 py-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {HIGHLIGHTS.map((item) => (
          <Card key={item.title} className="bg-gradient-to-b from-white/10 to-white/5">
            <CardHeader>
              <CardTitle className="text-xl">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{item.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
