export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { createIncomingPayment, createOneTimeContributionAuthorization } from '@/lib/open-payments'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { isValidWalletAddress } from '@/lib/wallet-address'
import { encryptSecret } from '@/lib/secret-crypto'

interface ContributeRequest {
  amount: number
  currency: string
  is_anonymous?: boolean
  donor_name?: string
}

function isContributeRequest(value: unknown): value is ContributeRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as { amount?: unknown; currency?: unknown; is_anonymous?: unknown; donor_name?: unknown }
  const isAnonymousValid = typeof candidate.is_anonymous === 'undefined' || typeof candidate.is_anonymous === 'boolean'
  const donorNameValid = typeof candidate.donor_name === 'undefined' || typeof candidate.donor_name === 'string'

  return typeof candidate.amount === 'number'
    && Number.isFinite(candidate.amount)
    && typeof candidate.currency === 'string'
    && candidate.currency.trim().length > 0
    && candidate.currency.trim().length <= 12
    && isAnonymousValid
    && donorNameValid
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
    const admin = createSupabaseAdminClient()

    const rawBody = await req.json() as unknown
    if (!isContributeRequest(rawBody)) {
      return NextResponse.json({ error: 'Invalid request body. Expected amount:number and currency:string' }, { status: 400 })
    }
    const body = {
      amount: rawBody.amount,
      currency: rawBody.currency.trim().toUpperCase(),
      is_anonymous: Boolean(rawBody.is_anonymous),
      donor_name: typeof rawBody.donor_name === 'string' ? rawBody.donor_name.trim().slice(0, 120) : '',
    }

    const donorName = body.donor_name || 'SafePool Member'

    if (body.amount <= 0) {
      return NextResponse.json({ error: 'currency and a positive amount are required' }, { status: 400 })
    }

    const { data: members, error: membersError } = await admin
      .from('members')
      .select('id,wallet_address')
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
      .limit(1)

    if (membersError) {
      return NextResponse.json({ error: `Failed to load member profile: ${membersError.message}` }, { status: 500 })
    }

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

      const { error: grantInsertError } = await admin
        .from('payment_grant_sessions')
        .insert({
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
            is_anonymous: body.is_anonymous,
            donor_name: donorName,
          }),
          status: 'pending',
        })

      if (grantInsertError) {
        return NextResponse.json({ error: `Failed to persist payment grant session: ${grantInsertError.message}` }, { status: 500 })
      }
    }

    const { error: pendingInsertError } = await admin
      .from('pending_contributions')
      .insert({
        id: contributionId,
        pool_id: GLOBAL_POOL_ID,
        member_id: members[0].id,
        amount: body.amount,
        currency: effectiveCurrency,
        incoming_payment_id: payment.incomingPaymentId,
        is_anonymous: body.is_anonymous,
        donor_name: donorName,
      })

    if (pendingInsertError) {
      return NextResponse.json({ error: `Failed to persist pending contribution: ${pendingInsertError.message}` }, { status: 500 })
    }

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
