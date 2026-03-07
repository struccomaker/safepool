import { createClient } from '@clickhouse/client'
import { NextRequest, NextResponse } from 'next/server'

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: 'safepool',
})

// New proposed values — shifted from the first seed to show change
const NEW_PROPOSALS: Record<string, number> = {
  safety_cap:          0.18,   // up from 0.24 → community wants to be more conservative
  trigger_sensitivity: 5.50,   // down from 7.09 → community wants lower trigger
  impact_radius:       90.0,   // down from 140.45 → tighter radius
}

export async function POST(req: NextRequest) {
  try {

    const resetOnly = req.headers.get('x-phase') === 'reset-only'

    // Step 1 — Fetch ALL proposals regardless of current status
    const pResult = await ch.query({
      query: `SELECT proposal_id, parameter FROM safepool.proposals FINAL`,
      format: 'JSONEachRow',
    })
    const allProposals = await pResult.json<{ proposal_id: string; parameter: string }>()

    if (allProposals.length === 0) {
      return NextResponse.json({ error: 'No proposals found' }, { status: 400 })
    }

    // Assign known parameter names to proposals (fixes corrupted empty-parameter rows)
    const parameterNames = Object.keys(NEW_PROPOSALS)
    const proposals = allProposals.slice(0, parameterNames.length).map((p, i) => ({
      ...p,
      parameter: parameterNames[i],
    }))

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
    const closedAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19)

    // Step 2 — Reset proposals back to 'open' with correct parameter names
    // ReplacingMergeTree: new row with same proposal_id + later submitted_at wins
    const resetRows = proposals.map(p => ({
      proposal_id:     p.proposal_id,
      parameter:       p.parameter,
      proposed_value:  NEW_PROPOSALS[p.parameter],
      current_value:   0,
      proposed_by:     'demo-seed',
      status:          'open',                  // ← force back to open
      quorum_required: 14031.66,
      pool_total_sgd:  70158.31,
      submitted_at:    now,                     // ← later timestamp beats old 'passed' row
      closed_at:       closedAt,
    }))

    await ch.insert({
      table: 'proposals',
      values: resetRows,
      format: 'JSONEachRow',
      clickhouse_settings: { input_format_skip_unknown_fields: 1 },
    })

    // Skip vote seeding if reset-only phase
    if (resetOnly) {
        return NextResponse.json({ reset: true, proposals: proposals.length })
    }

    // Step 3 — Seed 150 fresh yes-majority votes per proposal
    const votes = []
    for (const p of proposals) {
      for (let i = 0; i < 150; i++) {
        const weight = Math.round((Math.random() * 400 + 50) * 100) / 100
        const r = Math.random()
        const vote = r < 0.72 ? 'yes' : r < 0.88 ? 'no' : 'abstain'
        const offsetSec = Math.floor(Math.random() * 86400)
        const voteTime = new Date(Date.now() - offsetSec * 1000)
          .toISOString().replace('T', ' ').substring(0, 19)

        votes.push({
          proposal_id:  p.proposal_id,
          voter_id:     `demo-voter-round2-${i}`,
          vote,
          vote_weight:  weight,
          submitted_at: voteTime,
        })
      }
    }

    const BATCH = 50
    for (let i = 0; i < votes.length; i += BATCH) {
      await ch.insert({
        table: 'votes',
        values: votes.slice(i, i + BATCH),
        format: 'JSONEachRow',
        clickhouse_settings: { input_format_skip_unknown_fields: 1 },
      })
    }

    return NextResponse.json({
      seeded:    true,
      reset:     proposals.length,
      proposals: proposals.length,
      votes:     votes.length,
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/governance/seed-round]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

