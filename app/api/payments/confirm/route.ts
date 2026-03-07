import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'
import { sendContributionEmail } from '@/lib/email'

interface ConfirmBody {
  contribution_id: string
  member_email?: string
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as ConfirmBody

    if (!body.contribution_id) {
      return NextResponse.json({ error: 'contribution_id required' }, { status: 400 })
    }

    // Look up the pending contribution
    const result = await client.query({
      query: `SELECT id, pool_id, member_id, amount, currency FROM contributions WHERE id = {id:String} LIMIT 1`,
      query_params: { id: body.contribution_id },
      format: 'JSONEachRow',
    })
    const rows = (await result.json()) as { id: string; pool_id: string; member_id: string; amount: number; currency: string }[]

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 })
    }
    const contribution = rows[0]

    // Mark as completed
    await client.query({
      query: `ALTER TABLE contributions UPDATE status = 'completed' WHERE id = {id:String}`,
      query_params: { id: body.contribution_id },
    })

    // Send confirmation email (non-blocking)
    if (body.member_email) {
      sendContributionEmail({
        to: body.member_email,
        amount: Number(contribution.amount),
        currency: contribution.currency,
        poolId: contribution.pool_id,
      }).catch(console.error)
    }

    return NextResponse.json({ id: body.contribution_id }, { status: 200 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
