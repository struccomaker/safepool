import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { createIncomingPayment } from '@/lib/open-payments'
import client from '@/lib/clickhouse'
import type { ContributeRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ContributeRequest

    // Create ILP incoming payment (falls back to demo mode if not configured)
    const payment = await createIncomingPayment({
      poolId: body.pool_id,
      amount: body.amount,
      currency: body.currency,
    })

    // Insert pending contribution row so confirm can look it up
    const contributionId = crypto.randomUUID()
    await client.insert({
      table: 'contributions',
      values: [{
        id: contributionId,
        pool_id: body.pool_id,
        member_id: body.member_id ?? 'guest',
        amount: body.amount,
        currency: body.currency,
        incoming_payment_id: payment.incomingPaymentId ?? payment.paymentUrl ?? '',
        status: 'pending',
      }],
      format: 'JSONEachRow',
    })

    return NextResponse.json({
      contribution_id: contributionId,
      paymentUrl: payment.paymentUrl,
      mode: payment.mode,
    }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
