import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import client from '@/lib/clickhouse'
import type { VoteRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as VoteRequest

    const id = crypto.randomUUID()

    await client.insert({
      table: 'votes',
      values: [{
        id,
        proposal_id: body.proposal_id,
        member_id: token.id as string,
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
