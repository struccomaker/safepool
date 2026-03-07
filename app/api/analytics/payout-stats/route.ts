export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const poolId = searchParams.get('poolId')

    if (poolId) {
      // Per-pool: return individual payout rows for PayoutTracker
      const result = await client.query({
        query: `
          SELECT id, pool_id, disaster_event_id, member_id,
                 amount, currency, status, payout_at
          FROM payouts
          WHERE pool_id = {pool_id:String}
          ORDER BY payout_at DESC
          LIMIT 50
        `,
        query_params: { pool_id: poolId },
        format: 'JSONEachRow',
      })
      const data = await result.json()
      return NextResponse.json(data)
    }

    // Global: aggregate stats for analytics page
    const result = await client.query({
      query: `
        SELECT
          d.disaster_type,
          countMerge(pl.payout_count) AS payout_count,
          sum(p.amount) AS total_paid,
          avgMerge(pl.avg_latency_seconds) AS avg_latency_seconds
        FROM payout_latency pl
        JOIN payouts p ON pl.pool_id = p.pool_id
        JOIN disaster_events d ON p.disaster_event_id = d.id
        WHERE p.status = 'completed'
        GROUP BY d.disaster_type
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
