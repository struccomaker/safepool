import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT count() AS count, any(disaster_event_id) AS last_event_id
        FROM payouts
        WHERE pool_id = {pool_id:String}
          AND payout_at >= now() - INTERVAL 1 HOUR
          AND status = 'completed'
      `,
      query_params: { pool_id: GLOBAL_POOL_ID },
      format: 'JSONEachRow',
    })
    const [row] = (await result.json()) as { count: number; last_event_id: string }[]

    if (!row || row.count === 0) {
      return NextResponse.json({ triggered: false })
    }

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
