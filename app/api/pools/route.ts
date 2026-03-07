import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import client from '@/lib/clickhouse'
import type { CreatePoolRequest } from '@/types'

export async function GET() {
  try {
    const result = await client.query({
      query: `
        SELECT id, name, description, created_by, distribution_model,
               contribution_frequency, contribution_amount, currency,
               trigger_rules, governance_rules, payout_cap, created_at, is_active
        FROM pools
        WHERE is_active = 1
        ORDER BY created_at DESC
      `,
      format: 'JSONEachRow',
    })
    const data = await result.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch pools' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as CreatePoolRequest

    const id = crypto.randomUUID()

    await client.insert({
      table: 'pools',
      values: [{
        id,
        name: body.name,
        description: body.description,
        created_by: token.id as string,
        distribution_model: body.distribution_model,
        contribution_frequency: body.contribution_frequency,
        contribution_amount: body.contribution_amount,
        currency: body.currency,
        trigger_rules: JSON.stringify(body.trigger_rules),
        governance_rules: JSON.stringify(body.governance_rules),
        payout_cap: body.payout_cap,
        is_active: 1,
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
