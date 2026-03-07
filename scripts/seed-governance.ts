import { createClient } from '@clickhouse/client'
import proposals from '../proposals.json'
import votes from '../votes.json'

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root
config({ path: resolve(process.cwd(), '.env.local') })

// Fail fast with a clear message rather than ECONNREFUSED
if (!process.env.CLICKHOUSE_HOST) {
  throw new Error('CLICKHOUSE_HOST is not set. Check your .env.local file.')
}

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: 'safepool',
})

async function seed() {
  console.log('Seeding proposals...')
  await ch.insert({
    table: 'proposals',
    values: proposals,
    format: 'JSONEachRow',
  })

  console.log('Seeding votes (raw)...')
  // Insert in batches of 100 to avoid request size limits
  const BATCH = 100
  for (let i = 0; i < votes.length; i += BATCH) {
    await ch.insert({
      table: 'votes',
      values: votes.slice(i, i + BATCH),
      format: 'JSONEachRow',
    })
    console.log(`  Inserted votes ${i + 1}–${Math.min(i + BATCH, votes.length)}`)
  }

  // The MV chain fires automatically on insert:
  //   votes → votes_deduped → vote_aggregates
  // Wait a moment for background processing then verify
  await new Promise(r => setTimeout(r, 2000))

    const check = await ch.query({
    query: `
        SELECT
        p.parameter,
        p.proposed_value,
        sumMerge(a.total_weight_all)     AS participation,
        sumIfMerge(a.total_weight_yes)   AS yes_weight,
        sumIfMerge(a.total_weight_no)    AS no_weight,
        countIfMerge(a.count_yes)        AS yes_votes,
        participation >= p.quorum_required AS quorum_met,
        yes_weight > no_weight             AS majority_yes
        FROM safepool.proposals AS p FINAL
        JOIN safepool.vote_aggregates AS a ON p.proposal_id = a.proposal_id
        GROUP BY p.parameter, p.proposed_value, p.quorum_required
        ORDER BY p.parameter
    `,
    format: 'JSONEachRow',
    })

    const rows = await check.json()
    console.log('\n--- Aggregation Verification ---')
    console.table(rows)

    await ch.close()
    console.log('\nDone.')

}

seed().catch(console.error)
