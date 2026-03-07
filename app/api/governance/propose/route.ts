// app/api/governance/propose/route.ts
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { createClient as createCH } from '@clickhouse/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

// ─── Types ────────────────────────────────────────────────────────────────
type ParameterKey = 'safety_cap' | 'trigger_sensitivity' | 'impact_radius'

interface ProposeRequest {
  parameter:      ParameterKey
  proposed_value: number
  current_value:  number
  voting_days?:   number
}

// ─── ClickHouse client ────────────────────────────────────────────────────
const ch = createCH({
  url:      process.env.CLICKHOUSE_HOST!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
  database: 'safepool',
})

// ─── Parameter bounds (enforce on write) ──────────────────────────────────
const PARAM_BOUNDS: Record<ParameterKey, { min: number; max: number }> = {
  safety_cap:          { min: 0.05, max: 0.25 },
  trigger_sensitivity: { min: 4.5,  max: 7.5  },
  impact_radius:       { min: 20,   max: 150   },
}

const QUORUM_REQUIRED = 14031.66   // 20% of pool total
const POOL_TOTAL_SGD  = 70158.31

function formatDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19)
}

// ─── POST — Create proposal ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await syncSupabaseUserToClickHouse(user)

    const body = await req.json() as ProposeRequest

    // Validate parameter key
    if (!['safety_cap', 'trigger_sensitivity', 'impact_radius'].includes(body.parameter)) {
      return NextResponse.json({ error: `Invalid parameter: ${body.parameter}` }, { status: 400 })
    }

    // Clamp proposed value to allowed bounds
    const bounds = PARAM_BOUNDS[body.parameter]
    const proposed_value = Math.min(Math.max(body.proposed_value, bounds.min), bounds.max)

    const id           = crypto.randomUUID()
    const now          = new Date()
    const days         = body.voting_days ?? 7
    const closedAt     = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    const submittedAt  = formatDateTime(now)
    const closedAtStr  = formatDateTime(closedAt)

    // ── 1. Write to Supabase (auth-linked ownership record) ──────────────
    const admin = createSupabaseAdminClient()
    const { error: supabaseError } = await admin
      .from('proposals')
      .insert({
        id,
        proposed_by:    user.id,
        parameter:      body.parameter,
        proposed_value,
        current_value:  body.current_value,
        status:         'open',
        voting_ends_at: closedAt.toISOString(),
      })

    if (supabaseError) {
      return NextResponse.json(
        { error: `Supabase insert failed: ${supabaseError.message}` },
        { status: 500 }
      )
    }

    // ── 2. Write to ClickHouse (governance analytics) ────────────────────
    await ch.insert({
      table: 'proposals',
      values: [{
        proposal_id:     id,
        parameter:       body.parameter,
        proposed_value,
        current_value:   body.current_value,
        proposed_by:     user.id,
        status:          'open',
        quorum_required: QUORUM_REQUIRED,
        pool_total_sgd:  POOL_TOTAL_SGD,
        submitted_at:    submittedAt,
        closed_at:       closedAtStr,
      }],
      format: 'JSONEachRow',
      clickhouse_settings: { input_format_skip_unknown_fields: 1 },
    })

    return NextResponse.json({ id, parameter: body.parameter, proposed_value }, { status: 201 })

  } catch (err: unknown) {
    console.error('[POST /api/governance/propose]', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── GET — Fetch proposals for VotingModal ────────────────────────────────
export async function GET() {
  try {
    const result = await ch.query({
      query: `
        SELECT
          proposal_id   AS id,
          parameter,
          proposed_value,
          current_value,
          status,
          submitted_at,
          closed_at
        FROM safepool.proposals
        FINAL
        ORDER BY submitted_at DESC
      `,
      format: 'JSONEachRow',
    })

    const rows = await result.json<{
      id:             string
      parameter:      ParameterKey
      proposed_value: number
      current_value:  number
      status:         string
      submitted_at:   string
      closed_at:      string
    }>()

    // Shape into display-ready proposal objects for VotingModal
    const proposals = rows.map(r => ({
      ...r,
      question: {
        safety_cap:
          `Change Safety Cap from ${(r.current_value * 100).toFixed(0)}% → ${(r.proposed_value * 100).toFixed(0)}%`,
        trigger_sensitivity:
          `Change Trigger Sensitivity from M${r.current_value.toFixed(1)} → M${r.proposed_value.toFixed(1)}`,
        impact_radius:
          `Change Impact Radius from ${r.current_value.toFixed(0)} km → ${r.proposed_value.toFixed(0)} km`,
      }[r.parameter] ?? `Change ${r.parameter} to ${r.proposed_value}`,
    }))

    return NextResponse.json({ proposals })

  } catch (err: unknown) {
    console.error('[GET /api/governance/propose]', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
