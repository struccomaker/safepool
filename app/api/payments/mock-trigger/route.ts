export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, toClickHouseDateTime } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createRecurringContributionGrant, getPoolWalletMetadata, pollOutgoingPaymentCompletion, processRecurringContribution } from '@/lib/open-payments'
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncSupabaseUserToClickHouse } from '@/lib/supabase/sync-user'
import { normalizeWalletAddress } from '@/lib/wallet-address'

const MOCK_NAMES = [
  'Avery Tan',
  'Maya Lim',
  'Noah Patel',
  'Sofia Reyes',
  'Liam Khan',
  'Hana Sato',
  'Kai Wong',
  'Nora Diaz',
  'Ethan Ong',
  'Iris Park',
]

const MOCK_COUNTRIES = ['SG', 'PH', 'MY', 'ID', 'TH', 'VN', 'IN', 'JP', 'KR', 'US', 'GB']

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function getOptionalEnv(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function isMockDonationEnabled(): boolean {
  const raw = process.env.MOCK_DONATION_ENABLED?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

function getBootstrapAmount(): number {
  const rawEnv = process.env.MOCK_DONOR_BOOTSTRAP_AMOUNT
  if (!rawEnv) {
    throw new Error('Missing required environment variable: MOCK_DONOR_BOOTSTRAP_AMOUNT')
  }

  const raw = Number(rawEnv)
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error('MOCK_DONOR_BOOTSTRAP_AMOUNT must be a positive number')
  }
  return raw
}

function randomAmount(maxAmount: number): number {
  const cap = Math.max(10, Math.floor(maxAmount))
  const floor = Math.min(10, cap)
  if (cap <= floor) {
    return cap
  }
  return Math.floor(Math.random() * (cap - floor + 1)) + floor
}

async function getOrCreateMemberId(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string): Promise<string> {
  const { data: existing, error: existingError } = await admin
    .from('members')
    .select('id')
    .eq('pool_id', GLOBAL_POOL_ID)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('joined_at', { ascending: false })
    .limit(1)

  if (existingError) {
    throw new Error(`Failed to load member profile: ${existingError.message}`)
  }

  if (existing.length > 0) {
    return existing[0].id
  }

  const { data: walletRows, error: walletError } = await admin
    .from('user_wallets')
    .select('wallet_address')
    .eq('user_id', userId)
    .eq('is_default', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (walletError) {
    throw new Error(`Failed to load default wallet: ${walletError.message}`)
  }

  if (walletRows.length === 0) {
    throw new Error('No default wallet is configured for your account. Set your wallet first.')
  }

  const memberId = crypto.randomUUID()
  const { error: insertMemberError } = await admin
    .from('members')
    .insert({
      id: memberId,
      pool_id: GLOBAL_POOL_ID,
      user_id: userId,
      wallet_address: walletRows[0].wallet_address,
      location_lat: 1.3521,
      location_lon: 103.8198,
      household_size: 1,
      is_active: true,
    })

  if (insertMemberError) {
    throw new Error(`Failed to create member profile: ${insertMemberError.message}`)
  }

  return memberId
}

async function createBootstrapApproval(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  donorWalletAddress: string,
  poolAssetCode: string
): Promise<NextResponse> {
  const memberIdForBootstrap = await getOrCreateMemberId(admin, userId)
  const bootstrapRecurringId = crypto.randomUUID()
  const bootstrapAmount = getBootstrapAmount()

  const grant = await createRecurringContributionGrant({
    recurringId: bootstrapRecurringId,
    memberWalletAddress: donorWalletAddress,
    amount: bootstrapAmount,
    currency: poolAssetCode,
    interval: 'P1M',
  })

  if (grant.mode === 'interaction_required') {
    const { error: grantInsertError } = await admin
      .from('payment_grant_sessions')
      .insert({
        id: crypto.randomUUID(),
        flow: 'recurring',
        reference_id: bootstrapRecurringId,
        continue_uri: grant.continueUri,
        continue_access_token: encryptSecret(grant.continueAccessToken),
        finish_nonce: grant.finishNonce,
        payload_json: JSON.stringify({
          member_id: memberIdForBootstrap,
          pool_id: GLOBAL_POOL_ID,
          member_wallet_address: donorWalletAddress,
          amount: bootstrapAmount,
          currency: poolAssetCode,
          interval: 'P1M',
          donor_name: 'Mock Bootstrap',
          is_anonymous: true,
          donor_country: 'SG',
          mock_bootstrap: true,
        }),
        status: 'pending',
      })

    if (grantInsertError) {
      throw new Error(`Failed to persist mock bootstrap grant session: ${grantInsertError.message}`)
    }

    return NextResponse.json({
      mode: 'interaction_required',
      redirectUrl: grant.redirectUrl,
      bootstrap_amount: bootstrapAmount,
      message: `Approve test wallet access once for ${bootstrapAmount}. Subsequent keypress donations will be instant.`,
    }, { status: 202 })
  }

  const { error: recurringInsertError } = await admin
    .from('recurring_contributions')
    .upsert({
      id: bootstrapRecurringId,
      member_id: memberIdForBootstrap,
      pool_id: GLOBAL_POOL_ID,
      member_wallet_address: donorWalletAddress,
      donor_name: 'Mock Bootstrap',
      is_anonymous: true,
      donor_country: 'SG',
      amount: bootstrapAmount,
      currency: poolAssetCode,
      interval: 'P1M',
      next_payment_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      access_token: encryptSecret(grant.accessToken),
      manage_uri: encryptSecret(grant.manageUri),
      status: 'paused',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (recurringInsertError) {
    throw new Error(`Failed to persist mock bootstrap token cache: ${recurringInsertError.message}`)
  }

  return NextResponse.json({
    mode: 'ready',
    bootstrap_amount: bootstrapAmount,
    message: 'Bootstrap token cached. Press 1 again for instant paid mock donations.',
  }, { status: 200 })
}

async function resolveMockDonorAccessToken(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  donorWalletAddress: string,
  envToken: string
): Promise<string> {
  if (envToken) {
    return envToken
  }

  const { data: recurringRows, error: recurringError } = await admin
    .from('recurring_contributions')
    .select('access_token,member_wallet_address,updated_at')
    .in('status', ['active', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(50)

  if (recurringError) {
    throw new Error(`Failed to load fallback donor access token: ${recurringError.message}`)
  }

  for (const row of recurringRows) {
    const rowWallet = typeof row.member_wallet_address === 'string' ? row.member_wallet_address : ''
    if (!rowWallet) {
      continue
    }

    try {
      const normalizedRowWallet = normalizeWalletAddress(rowWallet)
      if (normalizedRowWallet !== donorWalletAddress) {
        continue
      }

      if (typeof row.access_token === 'string' && row.access_token.length > 0) {
        return decryptSecret(row.access_token)
      }
    } catch {
      continue
    }
  }

  return ''
}

export async function POST() {
  try {
    if (!isMockDonationEnabled()) {
      return NextResponse.json({ error: 'Mock donation trigger is disabled' }, { status: 403 })
    }

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
    const donorWalletAddress = normalizeWalletAddress(getRequiredEnv('MOCK_DONOR_WALLET_ADDRESS'))
    const envDonorAccessToken = getOptionalEnv('MOCK_DONOR_ACCESS_TOKEN')
    const bootstrapAmount = getBootstrapAmount()

    const poolWallet = await getPoolWalletMetadata()
    let donorAccessToken = await resolveMockDonorAccessToken(admin, donorWalletAddress, envDonorAccessToken)

    if (!donorAccessToken) {
      return createBootstrapApproval(admin, user.id, donorWalletAddress, poolWallet.assetCode)
    }

    const amount = randomAmount(bootstrapAmount)
    const donorName = pickRandom(MOCK_NAMES)
    const donorCountry = pickRandom(MOCK_COUNTRIES)

    let payment
    try {
      payment = await processRecurringContribution({
        memberWalletAddress: donorWalletAddress,
        amount,
        currency: poolWallet.assetCode,
        accessToken: donorAccessToken,
        metadata: {
          source: 'mock-key-trigger',
          initiatedBy: user.id,
        },
      })
    } catch (paymentErr) {
      const message = paymentErr instanceof Error ? paymentErr.message : 'Mock donation payment failed'
      const isGrantFailure = message.includes('Error making Open Payments POST request')
        || message.includes('Insufficient Grant')
        || message.includes('invalid_token')

      if (isGrantFailure) {
        if (envDonorAccessToken) {
          return NextResponse.json({
            error: 'MOCK_DONOR_ACCESS_TOKEN is invalid or insufficient. Refresh token or remove it to use bootstrap approval flow.',
          }, { status: 401 })
        }
        return createBootstrapApproval(admin, user.id, donorWalletAddress, poolWallet.assetCode)
      }

      throw paymentErr
    }

    const settled = payment.status === 'processing'
      ? await pollOutgoingPaymentCompletion({ paymentId: payment.outgoingPaymentId, attempts: 8, intervalMs: 1000 })
      : { paymentId: payment.outgoingPaymentId, state: payment.status, debitAmount: amount }

    if (settled.state !== 'completed') {
      return NextResponse.json({ error: 'Mock donation payment did not complete yet' }, { status: 502 })
    }

    const memberId = await getOrCreateMemberId(admin, user.id)

    const contributionId = crypto.randomUUID()
    const contributedAtIso = new Date().toISOString()
    const { error: insertError } = await admin
      .from('contributions')
      .insert({
        id: contributionId,
        pool_id: GLOBAL_POOL_ID,
        member_id: memberId,
        donor_name: donorName,
        is_anonymous: false,
        donor_country: donorCountry,
        amount,
        currency: poolWallet.assetCode,
        incoming_payment_id: payment.outgoingPaymentId,
        contributed_at: contributedAtIso,
        status: 'completed',
      })

    if (insertError) {
      return NextResponse.json({ error: `Failed to persist mock contribution: ${insertError.message}` }, { status: 500 })
    }

    try {
      await insertRows('contributions', [{
        id: contributionId,
        pool_id: GLOBAL_POOL_ID,
        member_id: memberId,
        donor_name: donorName,
        is_anonymous: false,
        donor_country: donorCountry,
        amount,
        currency: poolWallet.assetCode,
        incoming_payment_id: payment.outgoingPaymentId,
        contributed_at: toClickHouseDateTime(new Date(contributedAtIso)),
        status: 'completed',
      }])
    } catch (mirrorErr) {
      console.error('Non-blocking ClickHouse contribution mirror write failed for mock donation', mirrorErr)
    }

    return NextResponse.json({
      id: contributionId,
      amount,
      currency: poolWallet.assetCode,
      donor_name: donorName,
      donor_country: donorCountry,
      payment_id: payment.outgoingPaymentId,
    }, { status: 201 })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
