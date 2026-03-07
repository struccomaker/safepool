export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { fetchAllDisasters } from '@/lib/disaster-apis'
import client from '@/lib/clickhouse'

export async function GET(req: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const events = await fetchAllDisasters()

    if (events.length > 0) {
      await client.insert({
        table: 'disaster_events',
        values: events,
        format: 'JSONEachRow',
      })
    }

    return NextResponse.json({ inserted: events.length })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
