import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { createIncomingPayment } from '@/lib/open-payments'
import type { ContributeRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as ContributeRequest

    const result = await createIncomingPayment({
      poolId: body.pool_id,
      amount: body.amount,
      currency: body.currency,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
