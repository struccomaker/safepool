import { createClient } from '@clickhouse/client'
import { NextResponse } from 'next/server'

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: 'safepool', 
})

export async function POST() {
  try {
    const result = await ch.query({
        query: `
            SELECT
            p.proposal_id,
            p.parameter,
            p.proposed_value                                          AS final_parameter_value,
            p.quorum_required,
            p.submitted_at,
            sumMerge(a.total_weight_all)                              AS participation_weight,
            sumIfMerge(a.total_weight_yes)                            AS yes_weight,
            sumIfMerge(a.total_weight_no)                             AS no_weight,
            countIfMerge(a.count_yes)                                 AS yes_count,
            countIfMerge(a.count_no)                                  AS no_count,
            countIfMerge(a.count_abstain)                             AS abstain_count,
            participation_weight >= p.quorum_required                 AS quorum_met,
            yes_weight > no_weight                                    AS majority_yes,
            (quorum_met AND majority_yes)                             AS proposal_passed
            FROM safepool.proposals AS p FINAL
            JOIN safepool.vote_aggregates AS a ON p.proposal_id = a.proposal_id
            WHERE p.status = 'open'
            GROUP BY
            p.proposal_id,
            p.parameter,
            p.proposed_value,
            p.quorum_required,
            p.submitted_at
            ORDER BY p.submitted_at DESC
        `,
        format: 'JSONEachRow',
    })

    const proposals = await result.json<{
      proposal_id:           string
      parameter:             string
      final_parameter_value: number
      proposal_passed:       number
    }>()

    const passed = proposals.filter(p => p.proposal_passed === 1)

    for (const p of passed) {
      await ch.insert({
        table: 'active_parameters',
        values: [{
          parameter:       p.parameter,
          current_value:   p.final_parameter_value,
          source_proposal: p.proposal_id,
        }],
        format: 'JSONEachRow',
      })
    }

    return NextResponse.json({ resolved: proposals, written: passed.length })

  } catch (error: unknown) {
    // Surface the real error in the curl response
    const message = error instanceof Error ? error.message : String(error)
    console.error('[POST /api/governance/resolve]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

