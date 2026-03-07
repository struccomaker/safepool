import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT pool_id, disaster_type,
               avgMerge(avg_latency_seconds) AS avg_latency_seconds,
               countMerge(payout_count) AS payout_count
        FROM payout_latency
        GROUP BY pool_id, disaster_type
        ORDER BY payout_count DESC
      `,
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
