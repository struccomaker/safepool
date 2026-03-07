export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import type { ProposeRequest } from '@/types'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

const VALID_CHANGE_TYPES = new Set(['trigger_rules', 'distribution_model', 'payout_cap', 'contribution_amount'])

function isProposeRequest(value: unknown): value is ProposeRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as {
    title?: unknown
    description?: unknown
    change_type?: unknown
    new_value?: unknown
    voting_days?: unknown
  }

  const votingDaysValid = typeof candidate.voting_days === 'undefined'
    || (typeof candidate.voting_days === 'number' && Number.isInteger(candidate.voting_days) && candidate.voting_days >= 1 && candidate.voting_days <= 30)

  return typeof candidate.title === 'string'
    && candidate.title.trim().length >= 3
    && candidate.title.trim().length <= 120
    && typeof candidate.description === 'string'
    && candidate.description.trim().length >= 3
    && candidate.description.trim().length <= 4000
    && typeof candidate.change_type === 'string'
    && VALID_CHANGE_TYPES.has(candidate.change_type)
    && typeof candidate.new_value === 'string'
    && candidate.new_value.trim().length > 0
    && candidate.new_value.trim().length <= 4000
    && votingDaysValid
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await syncSupabaseUserToClickHouse(user)
    const admin = createSupabaseAdminClient()

    const rawBody = await req.json() as unknown
    if (!isProposeRequest(rawBody)) {
      return NextResponse.json({ error: 'Invalid proposal request payload' }, { status: 400 })
    }

    const body: ProposeRequest = {
      pool_id: GLOBAL_POOL_ID,
      title: rawBody.title.trim(),
      description: rawBody.description.trim(),
      change_type: rawBody.change_type,
      new_value: rawBody.new_value.trim(),
      voting_days: rawBody.voting_days,
    }

    const id = crypto.randomUUID()
    const days = body.voting_days ?? 7
    const votingEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '')

    const { error: insertProposalError } = await admin
      .from('proposals')
      .insert({
        id,
        pool_id: GLOBAL_POOL_ID,
        proposed_by: user.id,
        title: body.title,
        description: body.description,
        change_type: body.change_type,
        new_value: body.new_value,
        voting_ends_at: new Date(votingEndsAt).toISOString(),
        status: 'open',
      })

    if (insertProposalError) {
      return NextResponse.json({ error: `Failed to create proposal: ${insertProposalError.message}` }, { status: 500 })
    }

    return NextResponse.json({ id }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
