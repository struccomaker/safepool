import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import client from '@/lib/clickhouse'
import type { ProposeRequest } from '@/types'
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

    const body = await req.json() as ProposeRequest

    const id = crypto.randomUUID()
    const days = body.voting_days ?? 7
    const votingEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '')

    await client.insert({
      table: 'proposals',
      values: [{
        id,
        pool_id: body.pool_id,
        proposed_by: user.id,
        title: body.title,
        description: body.description,
        change_type: body.change_type,
        new_value: body.new_value,
        voting_ends_at: votingEndsAt,
        status: 'open',
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
