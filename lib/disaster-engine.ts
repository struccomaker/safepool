import client from '@/lib/clickhouse'
import { processPayouts } from '@/lib/payout-engine'
import type { Pool, Member, DisasterEvent, TriggerRules } from '@/types'

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

/** Check if a disaster event triggers a pool's rules. Returns affected members or null. */
function checkTrigger(pool: Pool, disaster: DisasterEvent, members: Member[]): Member[] | null {
  const rules = JSON.parse(pool.trigger_rules) as TriggerRules

  if (!rules.disasterTypes.includes(disaster.disaster_type)) return null
  if (disaster.magnitude < rules.minMagnitude) return null

  const affected = members.filter(
    (m) =>
      m.is_active === 1 &&
      haversineDistance(m.location_lat, m.location_lon, disaster.location_lat, disaster.location_lon) <=
        rules.radius_km
  )

  return affected.length > 0 ? affected : null
}

/**
 * Evaluates all active pools against a disaster event and triggers payouts.
 * Returns the total number of payouts initiated.
 */
export async function evaluateTriggers(disasterEventId: string): Promise<number> {
  // Load the disaster event
  const eventResult = await client.query({
    query: `SELECT * FROM disaster_events WHERE id = {id:String} LIMIT 1`,
    query_params: { id: disasterEventId },
    format: 'JSONEachRow',
  })
  const [disaster] = (await eventResult.json()) as DisasterEvent[]
  if (!disaster) return 0

  // Load all active pools
  const poolsResult = await client.query({
    query: `SELECT * FROM pools WHERE is_active = 1`,
    format: 'JSONEachRow',
  })
  const pools = (await poolsResult.json()) as Pool[]

  let totalPayouts = 0

  for (const pool of pools) {
    // Load pool members
    const membersResult = await client.query({
      query: `SELECT * FROM members WHERE pool_id = {pool_id:String} AND is_active = 1`,
      query_params: { pool_id: pool.id },
      format: 'JSONEachRow',
    })
    const members = (await membersResult.json()) as Member[]

    const affectedMembers = checkTrigger(pool, disaster, members)
    if (!affectedMembers) continue

    // Get pool balance
    const balResult = await client.query({
      query: `SELECT sum(total_in) AS total FROM pool_balances WHERE pool_id = {pool_id:String}`,
      query_params: { pool_id: pool.id },
      format: 'JSONEachRow',
    })
    const [balRow] = (await balResult.json()) as { total: number }[]
    const totalFunds = balRow?.total ?? 0

    if (totalFunds <= 0) continue

    const count = await processPayouts({
      pool,
      disaster,
      affectedMembers,
      totalFunds,
    })
    totalPayouts += count
  }

  return totalPayouts
}
