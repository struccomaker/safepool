export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows } from '@/lib/clickhouse'
import { evaluateTriggers } from '@/lib/disaster-engine'
import type { ManualTriggerRequest } from '@/types'

const VALID_DISASTER_TYPES = new Set(['earthquake', 'flood', 'typhoon', 'cyclone', 'volcanic', 'tsunami', 'fire'])

function isManualTriggerRequest(value: unknown): value is ManualTriggerRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as {
    disaster_type?: unknown
    magnitude?: unknown
    location_lat?: unknown
    location_lon?: unknown
    location_name?: unknown
  }

  return typeof candidate.disaster_type === 'string'
    && VALID_DISASTER_TYPES.has(candidate.disaster_type)
    && typeof candidate.magnitude === 'number'
    && Number.isFinite(candidate.magnitude)
    && candidate.magnitude > 0
    && candidate.magnitude <= 12
    && typeof candidate.location_lat === 'number'
    && Number.isFinite(candidate.location_lat)
    && candidate.location_lat >= -90
    && candidate.location_lat <= 90
    && typeof candidate.location_lon === 'number'
    && Number.isFinite(candidate.location_lon)
    && candidate.location_lon >= -180
    && candidate.location_lon <= 180
    && typeof candidate.location_name === 'string'
    && candidate.location_name.trim().length >= 2
    && candidate.location_name.trim().length <= 200
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json() as unknown
    if (!isManualTriggerRequest(rawBody)) {
      return NextResponse.json({ error: 'Invalid manual disaster trigger payload' }, { status: 400 })
    }

    const body: ManualTriggerRequest = {
      disaster_type: rawBody.disaster_type,
      magnitude: rawBody.magnitude,
      location_lat: rawBody.location_lat,
      location_lon: rawBody.location_lon,
      location_name: rawBody.location_name.trim(),
    }

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
