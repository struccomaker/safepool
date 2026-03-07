import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import client from '@/lib/clickhouse'
import type { ProposeRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as ProposeRequest

    const id = crypto.randomUUID()
    const votingEndsAt = new Date(Date.now() + body.voting_days * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '')

    await client.insert({
      table: 'proposals',
      values: [{
        id,
        pool_id: body.pool_id,
        proposed_by: token.id as string,
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
