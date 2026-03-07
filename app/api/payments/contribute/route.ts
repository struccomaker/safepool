export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { createIncomingPayment, createOneTimeContributionAuthorization } from '@/lib/open-payments'
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

interface CreateOneTimeAuthorizationWithQuote extends Record<string, unknown> {
  mode: 'interaction_required'
  quoteId?: string
}

interface OpenPaymentsErrorLike {
  message?: string
  description?: string
  status?: number
  code?: string
}

function formatOpenPaymentsError(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return 'Internal error'
  }

  const e = err as OpenPaymentsErrorLike
  const parts = [
    e.message,
    e.description,
    typeof e.status === 'number' ? `status=${e.status}` : undefined,
    e.code ? `code=${e.code}` : undefined,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))

  if (parts.length === 0) {
    return 'Internal error'
  }

  return parts.join(' | ')
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

    const effectiveCurrency = payment.currency

    if (payment.mode === 'interaction_required') {
      return NextResponse.json({
        error: 'Pool incoming payment setup unexpectedly requires interaction. Use DEMO_MODE=true for demo or verify pool wallet grant configuration.',
      }, { status: 500 })
    }

    const authorization = await createOneTimeContributionAuthorization({
      contributionId,
      memberWalletAddress: memberWallet,
      incomingPaymentId: payment.incomingPaymentId,
      amount: body.amount,
      currency: effectiveCurrency,
    })

    if (authorization.mode === 'interaction_required') {
      const maybeQuoteId = (authorization as unknown as CreateOneTimeAuthorizationWithQuote).quoteId

      await insertRows('payment_grant_sessions', [{
        id: crypto.randomUUID(),
        flow: 'incoming',
        reference_id: contributionId,
        continue_uri: authorization.continueUri,
        continue_access_token: encryptSecret(authorization.continueAccessToken),
        finish_nonce: authorization.finishNonce,
        payload_json: JSON.stringify({
          amount: body.amount,
          currency: effectiveCurrency,
          pool_id: GLOBAL_POOL_ID,
          member_id: members[0].id,
          member_wallet_address: memberWallet,
          incoming_payment_id: payment.incomingPaymentId,
          quote_id: typeof maybeQuoteId === 'string' ? maybeQuoteId : '',
        }),
        status: 'pending',
      }])
    }

    await insertRows('pending_contributions', [{
        id: contributionId,
        pool_id: GLOBAL_POOL_ID,
        member_id: members[0].id,
        amount: body.amount,
        currency: effectiveCurrency,
        incoming_payment_id: payment.incomingPaymentId,
      }])

    return NextResponse.json({
      contribution_id: contributionId,
      paymentUrl: authorization.mode === 'interaction_required' ? authorization.paymentUrl : '',
      mode: authorization.mode,
      needsInteraction: authorization.needsInteraction,
      incomingPaymentId: payment.incomingPaymentId,
    }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = formatOpenPaymentsError(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
