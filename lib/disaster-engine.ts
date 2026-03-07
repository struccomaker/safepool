import client from '@/lib/clickhouse'
import { processPayouts } from '@/lib/payout-engine'
import { GLOBAL_POOL_ID, GLOBAL_POOL_CONFIG } from '@/lib/global-pool'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Pool, Member, DisasterEvent } from '@/types'

/** Haversine formula — returns distance in km between two lat/lon points */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Evaluates the global pool against a disaster event and triggers payouts.
 * Returns the total number of payouts initiated.
 */
export async function evaluateTriggers(disasterEventId: string): Promise<number> {
  const admin = createSupabaseAdminClient()

  // Load the disaster event
  const eventResult = await client.query({
    query: `
      SELECT
        id,
        source,
        external_id,
        disaster_type,
        magnitude,
        severity,
        location_name,
        location_lat,
        location_lon,
        occurred_at,
        raw_data,
        processed
      FROM disaster_events
      WHERE id = {id:String}
      LIMIT 1
    `,
    query_params: { id: disasterEventId },
    format: 'JSONEachRow',
  })
  const [disaster] = (await eventResult.json()) as DisasterEvent[]
  if (!disaster) return 0

  const rules = GLOBAL_POOL_CONFIG.trigger_rules

  // Check disaster type and magnitude against global pool config
  if (!rules.disasterTypes.includes(disaster.disaster_type)) return 0
  if (disaster.magnitude < rules.minMagnitude) return 0

  // Load all active members of the global pool
  const { data: memberRows, error: membersError } = await admin
    .from('members')
    .select('id,pool_id,user_id,wallet_address,location_lat,location_lon,household_size,joined_at,is_active')
    .eq('pool_id', GLOBAL_POOL_ID)
    .eq('is_active', true)

  if (membersError) {
    throw new Error(`Failed to load active members for disaster processing: ${membersError.message}`)
  }

  const members = (memberRows ?? []).map((row) => ({
    ...(row as Member),
    is_active: row.is_active ? 1 : 0,
  })) as Member[]

  // Filter to members within the disaster radius
  const affectedMembers = members.filter(
    (m) =>
      m.is_active === 1 &&
      haversineDistance(m.location_lat, m.location_lon, disaster.location_lat, disaster.location_lon) <=
        rules.radius_km
  )

  if (affectedMembers.length === 0) return 0

  // Get global pool balance
  const { data: contributionRows, error: contributionError } = await admin
    .from('contributions')
    .select('amount')
    .eq('pool_id', GLOBAL_POOL_ID)
    .eq('status', 'completed')

  if (contributionError) {
    throw new Error(`Failed to load contribution balance for disaster processing: ${contributionError.message}`)
  }

  const totalFunds = (contributionRows ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

  if (totalFunds <= 0) return 0

  // Build a Pool-shaped object from global config for the payout engine
  const globalPool: Pool = {
    id: GLOBAL_POOL_ID,
    name: GLOBAL_POOL_CONFIG.name,
    description: GLOBAL_POOL_CONFIG.description,
    created_by: '',
    distribution_model: GLOBAL_POOL_CONFIG.distribution_model,
    contribution_frequency: 'monthly',
    contribution_amount: 0,
    currency: GLOBAL_POOL_CONFIG.currency,
    trigger_rules: JSON.stringify(rules),
    governance_rules: JSON.stringify({ quorum_pct: 50, vote_threshold: 60 }),
    payout_cap: GLOBAL_POOL_CONFIG.payout_cap,
    created_at: '',
    is_active: 1,
  }

  return processPayouts({
    pool: globalPool,
    disaster,
    affectedMembers,
    totalFunds,
  })
}
