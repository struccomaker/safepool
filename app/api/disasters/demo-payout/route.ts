export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { queryRows } from '@/lib/clickhouse'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

interface ActiveParameter {
  parameter: string
  current_value: number
  [key: string]: unknown
}

interface PayoutParams {
  safety_cap: number
  trigger_sensitivity: number
  impact_radius: number
}

const DEFAULTS: PayoutParams = {
  safety_cap: 0.10,
  trigger_sensitivity: 6.0,
  impact_radius: 50.0,
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Linear severity multiplier: M6.0 = 0.5, M8.0 = 1.0 */
function calcSeverityMultiplier(magnitude: number): number {
  return Math.max(0.25, Math.min(1.0, 0.5 + (magnitude - 6.0) * 0.25))
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { magnitude?: number; location_lat?: number; location_lon?: number }
    const magnitude = Number(body.magnitude)
    const locationLat = Number(body.location_lat)
    const locationLon = Number(body.location_lon)

    if (!Number.isFinite(magnitude) || !Number.isFinite(locationLat) || !Number.isFinite(locationLon)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    // 1. Fetch governance parameters from ClickHouse
    let params = { ...DEFAULTS }
    try {
      const rows = await queryRows<ActiveParameter>(
        'SELECT parameter, toString(current_value) AS current_value FROM safepool.active_parameters FINAL ORDER BY parameter ASC'
      )
      if (rows.length > 0) {
        params = rows.reduce(
          (acc, row) => ({ ...acc, [row.parameter]: Number(row.current_value) }),
          { ...DEFAULTS }
        )
      }
    } catch {
      // Use defaults on ClickHouse error
    }

    // 2. Get pool balance from Supabase (sum of completed contributions)
    const admin = createSupabaseAdminClient()
    const { data: contributionRows, error: contributionError } = await admin
      .from('contributions')
      .select('amount')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('status', 'completed')

    if (contributionError) {
      throw new Error(`Failed to load pool balance: ${contributionError.message}`)
    }

    const poolBalance = (contributionRows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

    // 3. Count affected members (within impact_radius of epicentre)
    const { data: memberRows, error: membersError } = await admin
      .from('members')
      .select('id,location_lat,location_lon')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('is_active', true)

    if (membersError) {
      throw new Error(`Failed to load members: ${membersError.message}`)
    }

    const allMembers = memberRows ?? []
    const spatiallyAffected = allMembers.filter(
      (m) => haversineDistance(m.location_lat, m.location_lon, locationLat, locationLon) <= params.impact_radius
    )

    // Use hardcoded 4 affected families for demo
    const affectedCount = 4

    // 4. Calculate payout using governance formula:
    //    Individual = (Pool Balance × Safety Cap) / Affected × Severity Multiplier
    //    Total      = Pool Balance × Safety Cap × Severity Multiplier
    const sevMult = calcSeverityMultiplier(magnitude)
    const totalPayout = poolBalance * params.safety_cap * sevMult
    const perMemberPayout = affectedCount > 0 ? totalPayout / affectedCount : 0

    return NextResponse.json({
      pool_balance: poolBalance,
      safety_cap: params.safety_cap,
      trigger_sensitivity: params.trigger_sensitivity,
      impact_radius: params.impact_radius,
      severity_multiplier: sevMult,
      affected_count: affectedCount,
      total_payout: totalPayout,
      per_member_payout: perMemberPayout,
      magnitude,
      currency: 'SGD',
    })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
