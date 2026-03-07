import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import client from '@/lib/clickhouse'
import type { VoteRequest } from '@/types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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

    const body = await req.json() as VoteRequest

    const id = crypto.randomUUID()

    await client.insert({
      table: 'votes',
      values: [{
        id,
        proposal_id: body.proposal_id,
        member_id: user.id,
        pool_id: body.pool_id,
        vote: body.vote,
      }],
      format: 'JSONEachRow',
    })

    return NextResponse.json({ id }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
