import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const STEPS = [
  {
    title: 'Create a local fund pool',
    description:
      'Set contribution rules, disaster triggers, and payout model for your neighborhood, campus, or worker group.',
  },
  {
    title: 'Members contribute micro-amounts',
    description:
      'Contributions flow through Interledger-compatible wallets and are tracked in ClickHouse in real time.',
  },
  {
    title: 'Disaster engine validates events',
    description:
      'USGS and GDACS signals are matched against pool coordinates and severity thresholds before triggering payouts.',
  },
  {
    title: 'Instant automated payouts',
    description:
      'Open Payments sends emergency funds to affected members, with live status updates shown in the dashboard.',
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8">
        <Badge variant="outline">How it works</Badge>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">One platform, end-to-end response</h2>
        <p className="mt-3 max-w-2xl text-white/65">
          The full lifecycle runs in one flow: fund formation, contribution tracking, disaster detection, and payout
          execution.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {STEPS.map((step, index) => (
          <Card key={step.title}>
            <CardHeader>
              <p className="text-sm text-cyan-300">Step {index + 1}</p>
              <CardTitle>{step.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{step.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
