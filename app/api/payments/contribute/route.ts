import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { createIncomingPayment } from '@/lib/open-payments'
import { insertRows } from '@/lib/clickhouse'
import type { ContributeRequest } from '@/types'

const GUEST_MEMBER_ID = '00000000-0000-0000-0000-000000000000'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeMemberId(memberId?: string): string {
  if (!memberId) return GUEST_MEMBER_ID
  return UUID_REGEX.test(memberId) ? memberId : GUEST_MEMBER_ID
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ContributeRequest

    if (!body.pool_id || !body.currency || typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json({ error: 'pool_id, currency, and a positive amount are required' }, { status: 400 })
    }

    // Create ILP incoming payment (falls back to demo mode if not configured)
    const payment = await createIncomingPayment({
      poolId: body.pool_id,
      amount: body.amount,
      currency: body.currency,
    })

    // Insert pending contribution row so confirm can look it up
    const contributionId = crypto.randomUUID()
    await insertRows('pending_contributions', [{
        id: contributionId,
        pool_id: body.pool_id,
        member_id: normalizeMemberId(body.member_id),
        amount: body.amount,
        currency: body.currency,
        incoming_payment_id: payment.incomingPaymentId ?? payment.paymentUrl ?? '',
      }])

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
