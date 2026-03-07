export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { evaluateTriggers } from '@/lib/disaster-engine'
import client from '@/lib/clickhouse'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all unprocessed disaster events
    const result = await client.query({
      query: `
        SELECT id FROM disaster_events
        WHERE processed = 0
        ORDER BY occurred_at DESC
        LIMIT 20
      `,
      format: 'JSONEachRow',
    })
    const events = (await result.json()) as { id: string }[]

    let totalPayouts = 0
    for (const event of events) {
      const count = await evaluateTriggers(event.id)
      totalPayouts += count

      // Mark as processed
      await client.query({
        query: `ALTER TABLE disaster_events UPDATE processed = 1 WHERE id = {id:String}`,
        query_params: { id: event.id },
      })
    }

    return NextResponse.json({ processed: events.length, payouts: totalPayouts })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
