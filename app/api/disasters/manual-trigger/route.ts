export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows } from '@/lib/clickhouse'
import { evaluateTriggers } from '@/lib/disaster-engine'
import type { ManualTriggerRequest } from '@/types'

export async function POST(req: Request) {
  try {
    const body = await req.json() as ManualTriggerRequest

    // Insert synthetic disaster event
    const eventId = crypto.randomUUID()
    await insertRows('disaster_events', [{
        id: eventId,
        source: 'manual',
        external_id: `manual-${eventId}`,
        disaster_type: body.disaster_type,
        magnitude: body.magnitude,
        severity: body.magnitude >= 7 ? 'critical' : body.magnitude >= 6 ? 'high' : 'medium',
        location_name: body.location_name,
        location_lat: body.location_lat,
        location_lon: body.location_lon,
        occurred_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
        raw_data: JSON.stringify(body),
        processed: 0,
      }])

    const claimToken = crypto.randomUUID()

    try {
      const payoutCount = await evaluateTriggers(eventId)

      await insertRows('disaster_event_processing', [{
        event_id: eventId,
        claim_token: claimToken,
        status: 'completed',
        payouts_count: payoutCount,
        failure_reason: '',
      }])
    } catch (payoutError: unknown) {
      const failureReason = payoutError instanceof Error ? payoutError.message : 'Unknown payout processing error'

      await insertRows('disaster_event_processing', [{
        event_id: eventId,
        claim_token: claimToken,
        status: 'failed',
        payouts_count: 0,
        failure_reason: failureReason,
      }])

      throw payoutError
    }

    return NextResponse.json({ eventId })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
