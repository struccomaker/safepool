export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'

export async function GET(_req: Request, context: { params: Promise<{ poolId: string }> }) {
  try {
    const { poolId } = await context.params

    // Check if any payouts were sent for this pool in the last hour
    const result = await client.query({
      query: `
        SELECT count() AS count, any(disaster_event_id) AS last_event_id
        FROM payouts
        WHERE pool_id = {pool_id:String}
          AND payout_at >= now() - INTERVAL 1 HOUR
          AND status = 'completed'
      `,
      query_params: { pool_id: poolId },
      format: 'JSONEachRow',
    })
    const [row] = (await result.json()) as { count: number; last_event_id: string }[]

    if (!row || row.count === 0) {
      return NextResponse.json({ triggered: false })
    }

    // Get the disaster name
    const eventResult = await client.query({
      query: `SELECT location_name, disaster_type FROM disaster_events WHERE id = {id:String} LIMIT 1`,
      query_params: { id: row.last_event_id },
      format: 'JSONEachRow',
    })
    const [event] = (await eventResult.json()) as { location_name: string; disaster_type: string }[]

    return NextResponse.json({
      triggered: true,
      disasterName: event ? `${event.disaster_type} — ${event.location_name}` : 'Unknown disaster',
      payoutsCount: row.count,
    })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ triggered: false })
  }
}
