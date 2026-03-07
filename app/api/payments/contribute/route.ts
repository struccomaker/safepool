export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { createIncomingPayment } from '@/lib/open-payments'
import { insertRows, queryRows } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { isValidWalletAddress } from '@/lib/wallet-address'
import { encryptSecret } from '@/lib/secret-crypto'

interface ContributeRequest {
  amount: number
  currency: string
}

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

    await syncSupabaseUserToClickHouse(user)

    const body = await req.json() as ContributeRequest

    if (!body.currency || typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json({ error: 'currency and a positive amount are required' }, { status: 400 })
    }

    const members = await queryRows<{ id: string; wallet_address: string }>(
      `
      SELECT toString(id) AS id, wallet_address
      FROM members
      WHERE pool_id = toUUID({pool_id:String})
        AND user_id = toUUID({user_id:String})
        AND is_active = 1
      ORDER BY joined_at DESC
      LIMIT 1
      `,
      {
        pool_id: GLOBAL_POOL_ID,
        user_id: user.id,
      }
    )

    if (members.length === 0) {
      return NextResponse.json({ error: 'Join SafePool first before contributing' }, { status: 400 })
    }

    const memberWallet = members[0].wallet_address
    if (!isValidWalletAddress(memberWallet)) {
      return NextResponse.json({ error: 'Your wallet address is invalid. Update it at /api/wallet/me' }, { status: 400 })
    }

    const contributionId = crypto.randomUUID()

    const payment = await createIncomingPayment({
      contributionId,
      amount: body.amount,
      currency: body.currency,
    })

    if (payment.mode === 'interaction_required') {
      await insertRows('payment_grant_sessions', [{
        id: crypto.randomUUID(),
        flow: 'incoming',
        reference_id: contributionId,
        continue_uri: payment.continueUri,
        continue_access_token: encryptSecret(payment.continueAccessToken),
        finish_nonce: payment.finishNonce,
        payload_json: JSON.stringify({
          amount: body.amount,
          currency: body.currency,
          pool_id: GLOBAL_POOL_ID,
          member_id: members[0].id,
        }),
        status: 'pending',
      }])
    }

    await insertRows('pending_contributions', [{
        id: contributionId,
        pool_id: GLOBAL_POOL_ID,
        member_id: members[0].id,
        amount: body.amount,
        currency: body.currency,
        incoming_payment_id: payment.mode === 'interaction_required' ? '' : payment.incomingPaymentId,
      }])

    return NextResponse.json({
      contribution_id: contributionId,
      paymentUrl: payment.paymentUrl,
      mode: payment.mode,
      needsInteraction: payment.mode === 'interaction_required',
    }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
