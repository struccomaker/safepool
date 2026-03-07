export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { evaluateTriggers } from '@/lib/disaster-engine'
import { insertRows, queryRows } from '@/lib/clickhouse'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all unprocessed disaster events
    const events = await queryRows<{ id: string }>(`
      SELECT d.id
      FROM disaster_events d
      LEFT JOIN (
        SELECT
          event_id,
          toString(argMax(status, processed_at)) AS latest_status,
          max(processed_at) AS latest_at
        FROM disaster_event_processing
        GROUP BY event_id
      ) dep ON d.id = dep.event_id
      WHERE dep.latest_status = ''
         OR dep.latest_status = 'failed'
         OR (dep.latest_status = 'processing' AND dep.latest_at < now() - INTERVAL 5 MINUTE)
      ORDER BY d.occurred_at DESC
      LIMIT 20
    `)

    let totalPayouts = 0
    for (const event of events) {
      const claimToken = crypto.randomUUID()

      await insertRows('disaster_event_processing', [{
        event_id: event.id,
        claim_token: claimToken,
        status: 'processing',
        payouts_count: 0,
        failure_reason: '',
      }])

      const lockRows = await queryRows<{ claim_token: string }>(
        `
        SELECT toString(argMax(claim_token, processed_at)) AS claim_token
        FROM disaster_event_processing
        WHERE event_id = toUUID({id:String})
        GROUP BY event_id
        `,
        { id: event.id }
      )

      if (lockRows.length > 0 && lockRows[0].claim_token !== claimToken) {
        continue
      }

      try {
        const count = await evaluateTriggers(event.id)
        totalPayouts += count

        await insertRows('disaster_event_processing', [{
          event_id: event.id,
          claim_token: claimToken,
          status: 'completed',
          payouts_count: count,
          failure_reason: '',
        }])
      } catch (eventErr: unknown) {
        const failureReason = eventErr instanceof Error ? eventErr.message : 'Unknown payout processing error'

        await insertRows('disaster_event_processing', [{
          event_id: event.id,
          claim_token: claimToken,
          status: 'failed',
          payouts_count: 0,
          failure_reason: failureReason,
        }])

        throw eventErr
      }
    }

    return NextResponse.json({ processed: events.length, payouts: totalPayouts })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
