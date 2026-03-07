import { NextResponse } from 'next/server'
import client from '@/lib/clickhouse'
import { sendContributionEmail } from '@/lib/email'

interface ConfirmBody {
  pool_id: string
  member_id: string
  amount: number
  currency: string
  incoming_payment_id: string
  member_email?: string
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as ConfirmBody

    const id = crypto.randomUUID()

    await client.insert({
      table: 'contributions',
      values: [{
        id,
        pool_id: body.pool_id,
        member_id: body.member_id,
        amount: body.amount,
        currency: body.currency,
        incoming_payment_id: body.incoming_payment_id,
        status: 'completed',
      }],
      format: 'JSONEachRow',
    })

    // Send confirmation email (non-blocking)
    if (body.member_email) {
      sendContributionEmail({
        to: body.member_email,
        amount: body.amount,
        currency: body.currency,
        poolId: body.pool_id,
      }).catch(console.error)
    }

    return NextResponse.json({ id }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
