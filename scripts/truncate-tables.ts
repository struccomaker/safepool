import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@clickhouse/client'

if (!process.env.CLICKHOUSE_HOST) {
  throw new Error('CLICKHOUSE_HOST is not set. Check your .env.local file.')
}

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: 'safepool',
})

const TABLES = [
  'votes',
  'votes_deduped',
  'vote_aggregates',
  'active_parameters',
  'proposals',
]

async function truncateAll() {
  console.log('Truncating all safepool governance tables...\n')

  for (const table of TABLES) {
    await ch.command({ query: `TRUNCATE TABLE safepool.${table}` })
    console.log(`  ✓ safepool.${table}`)
  }

  console.log('\nVerifying row counts...\n')
  const result = await ch.query({
    query: TABLES.map(t =>
      `SELECT '${t}' AS tbl, count() AS rows FROM safepool.${t}`
    ).join('\nUNION ALL\n'),
    format: 'JSONEachRow',
  })

  const rows = await result.json<{ tbl: string; rows: string }>()
  for (const r of rows) {
    const ok = r.rows === '0'
    console.log(`  ${ok ? '✓' : '✗'} ${r.tbl.padEnd(20)} ${r.rows} rows`)
  }

  await ch.close()
  console.log('\nDone.')
}

truncateAll().catch(err => {
  console.error('\n❌ Truncate failed:', err.message)
  process.exit(1)
})
