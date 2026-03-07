export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import type { VoteRequest } from '@/types'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'

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

    const body = await req.json() as VoteRequest

    const id = crypto.randomUUID()

    const { data: memberRows, error: memberError } = await admin
      .from('members')
      .select('id')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
      .limit(1)

    if (memberError) {
      return NextResponse.json({ error: `Failed to load voting member profile: ${memberError.message}` }, { status: 500 })
    }

    if (memberRows.length === 0) {
      return NextResponse.json({ error: 'Join SafePool before voting' }, { status: 400 })
    }

    const { error: insertVoteError } = await admin
      .from('votes')
      .insert({
        id,
        proposal_id: body.proposal_id,
        member_id: memberRows[0].id,
        pool_id: GLOBAL_POOL_ID,
        vote: body.vote,
      })

    if (insertVoteError) {
      return NextResponse.json({ error: `Failed to cast vote: ${insertVoteError.message}` }, { status: 500 })
    }

    return NextResponse.json({ id }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
