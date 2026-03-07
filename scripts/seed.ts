/**
 * SafePool seed script — inserts demo data into ClickHouse
 * Run: npm run seed
 */

import { createClient } from '@clickhouse/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const client = createClient({
  url: process.env.CLICKHOUSE_HOST!,
  username: process.env.CLICKHOUSE_USER ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: process.env.CLICKHOUSE_DATABASE ?? 'safepool',
})

const POOL_ID = '00000000-0000-0000-0000-000000000001'
const USER_IDS = [
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000005',
]
const MEMBER_IDS = USER_IDS.map((_, i) => `20000000-0000-0000-0000-00000000000${i + 1}`)

// Metro Manila area coordinates
const MANILA_COORDS = [
  { lat: 14.5995, lon: 120.9842 },
  { lat: 14.6507, lon: 121.0486 },
  { lat: 14.5547, lon: 121.0244 },
  { lat: 14.4826, lon: 121.0165 },
  { lat: 14.7011, lon: 121.0669 },
]

async function seed() {
  console.log('Seeding SafePool demo data...')

  // Users
  await client.insert({
    table: 'users',
    values: USER_IDS.map((id, i) => ({
      id,
      email: `demo${i + 1}@safepool.dev`,
      name: `Demo User ${i + 1}`,
    })),
    format: 'JSONEachRow',
  })
  console.log('✓ Users inserted')

  // Pool
  await client.insert({
    table: 'pools',
    values: [{
      id: POOL_ID,
      name: 'SafePool Global Fund',
      description: 'One shared emergency fund. Contribute together — when disaster strikes, affected members receive instant Interledger payouts.',
      created_by: USER_IDS[0],
      distribution_model: 'equal_split',
      contribution_frequency: 'monthly',
      contribution_amount: 10,
      currency: 'USD',
      trigger_rules: JSON.stringify({ minMagnitude: 6.0, disasterTypes: ['earthquake', 'flood', 'typhoon', 'cyclone', 'volcanic', 'tsunami', 'fire'], radius_km: 100 }),
      governance_rules: JSON.stringify({ quorum_pct: 50, vote_threshold: 60 }),
      payout_cap: 500,
      is_active: 1,
    }],
    format: 'JSONEachRow',
  })
  console.log('✓ Pool inserted')

  // Members
  await client.insert({
    table: 'members',
    values: MEMBER_IDS.map((id, i) => ({
      id,
      pool_id: POOL_ID,
      user_id: USER_IDS[i],
      wallet_address: `https://wallet.interledger-test.dev/demo${i + 1}`,
      location_lat: MANILA_COORDS[i].lat,
      location_lon: MANILA_COORDS[i].lon,
      household_size: i + 1,
      is_active: 1,
    })),
    format: 'JSONEachRow',
  })
  console.log('✓ Members inserted')

  // Contributions (3 months of demo data)
  const contributions = []
  for (let month = 0; month < 3; month++) {
    for (const memberId of MEMBER_IDS) {
      const date = new Date()
      date.setMonth(date.getMonth() - month)
      contributions.push({
        id: crypto.randomUUID(),
        pool_id: POOL_ID,
        member_id: memberId,
        amount: 10,
        currency: 'USD',
        incoming_payment_id: `demo-${crypto.randomUUID()}`,
        contributed_at: date.toISOString().replace('T', ' ').replace('Z', ''),
        status: 'completed',
      })
    }
  }
  await client.insert({ table: 'contributions', values: contributions, format: 'JSONEachRow' })
  console.log(`✓ ${contributions.length} contributions inserted`)

  // Disaster event
  const disasterId = '30000000-0000-0000-0000-000000000001'
  await client.insert({
    table: 'disaster_events',
    values: [{
      id: disasterId,
      source: 'usgs',
      external_id: 'demo-earthquake-001',
      disaster_type: 'earthquake',
      magnitude: 6.5,
      severity: 'high',
      location_name: 'Metro Manila, Philippines',
      location_lat: 14.5995,
      location_lon: 120.9842,
      occurred_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
      raw_data: '{}',
      processed: 1,
    }],
    format: 'JSONEachRow',
  })
  console.log('✓ Disaster event inserted')

  // Proposal
  await client.insert({
    table: 'proposals',
    values: [{
      id: '40000000-0000-0000-0000-000000000001',
      pool_id: POOL_ID,
      proposed_by: USER_IDS[0],
      title: 'Lower trigger magnitude to 5.5',
      description: 'More frequent smaller earthquakes also cause damage. Propose lowering the threshold.',
      change_type: 'trigger_rules',
      new_value: JSON.stringify({ minMagnitude: 5.5, disasterTypes: ['earthquake', 'flood'], radius_km: 50 }),
      voting_ends_at: new Date(Date.now() + 7 * 86400000).toISOString().replace('T', ' ').replace('Z', ''),
      status: 'open',
    }],
    format: 'JSONEachRow',
  })
  console.log('✓ Proposal inserted')

  console.log('\nSeed complete! Visit http://localhost:3000 to see the demo data.')
  await client.close()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
