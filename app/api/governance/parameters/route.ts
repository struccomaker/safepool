import { createClient } from '@clickhouse/client'
import { NextResponse } from 'next/server'

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: 'safepool',
})

type Parameter = 'safety_cap' | 'trigger_sensitivity' | 'impact_radius'

interface ActiveParameter {
  parameter:       Parameter
  current_value:   number
  source_proposal: string
  effective_from:  string
}

export interface PayoutParameters {
  safety_cap:           number
  trigger_sensitivity:  number
  impact_radius:        number
}

// Fallback defaults if no proposals have passed yet
const DEFAULTS: PayoutParameters = {
  safety_cap:          0.10,
  trigger_sensitivity: 6.0,
  impact_radius:       50.0,
}

export async function GET() {
  try {
    const result = await ch.query({
      query: `
        SELECT
          parameter,
          current_value,
          source_proposal,
          effective_from
        FROM safepool.active_parameters
        FINAL
        ORDER BY parameter ASC
      `,
      format: 'JSONEachRow',
    })

    const rows = await result.json<ActiveParameter>()

    // Fold rows into a typed flat object with fallback to defaults
    // for any parameter not yet set by a passed proposal
    const parameters: PayoutParameters = rows.reduce(
      (acc, row) => ({ ...acc, [row.parameter]: row.current_value }),
      { ...DEFAULTS }
    )

    // Also return metadata for each parameter (source proposal + when it took effect)
    const metadata = rows.reduce(
      (acc, row) => ({
        ...acc,
        [row.parameter]: {
          source_proposal: row.source_proposal,
          effective_from:  row.effective_from,
        },
      }),
      {} as Record<Parameter, { source_proposal: string; effective_from: string }>
    )

    return NextResponse.json({
      parameters,
      metadata,
      using_defaults: rows.length === 0,
    })

  } catch (error) {
    console.error('[GET /api/safepool/parameters]', error)

    // Return defaults on error so the payout algorithm is never blocked
    return NextResponse.json(
      { parameters: DEFAULTS, metadata: {}, using_defaults: true },
      { status: 200 }
    )
  }
}
