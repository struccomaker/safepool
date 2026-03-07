export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { insertRows, toClickHouseDateTime } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createReusableOutgoingGrant, getPoolWalletMetadata, processRecurringContribution, rotateAccessToken } from '@/lib/open-payments'
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

  // Request a very generous grant limit so many mock payments can be made
  // without re-approval. Individual payments are a fraction of this.
  const grant = await createReusableOutgoingGrant({
    grantId: bootstrapRecurringId,
    memberWalletAddress: donorWalletAddress,
    maxAmount: bootstrapAmount * 100,
    currency: poolAssetCode,
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
): Promise<{ accessToken: string; recurringId: string; manageUri: string }> {
  if (envToken) {
    return {
      accessToken: envToken,
      recurringId: '',
      manageUri: '',
    }
  }

  // Primary query: look for "Mock Bootstrap" rows
  const { data: recurringRows, error: recurringError } = await admin
    .from('recurring_contributions')
    .select('id,access_token,manage_uri,member_wallet_address,donor_name,status,updated_at')
    .eq('donor_name', 'Mock Bootstrap')
    .in('status', ['active', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(50)

  if (recurringError) {
    console.error('[mock-trigger] resolveMockDonorAccessToken Supabase query error:', recurringError.message)
    throw new Error(`Failed to load fallback donor access token: ${recurringError.message}`)
  }

  console.log(`[mock-trigger] Found ${recurringRows.length} 'Mock Bootstrap' recurring_contributions rows`)
  console.log(`[mock-trigger] Looking for donorWalletAddress: "${donorWalletAddress}"`)

  for (const row of recurringRows) {
    const rowWallet = typeof row.member_wallet_address === 'string' ? row.member_wallet_address : ''
    console.log(`[mock-trigger] Row id=${row.id} wallet="${rowWallet}" status="${row.status}" donor_name="${row.donor_name}" has_token=${Boolean(row.access_token)}`)
    if (!rowWallet) {
      continue
    }

    try {
      const normalizedRowWallet = normalizeWalletAddress(rowWallet)
      console.log(`[mock-trigger] Normalized row wallet: "${normalizedRowWallet}" vs donor: "${donorWalletAddress}" match=${normalizedRowWallet === donorWalletAddress}`)
      if (normalizedRowWallet !== donorWalletAddress) {
        continue
      }

      if (typeof row.access_token === 'string' && row.access_token.length > 0) {
        console.log(`[mock-trigger] ✅ Found matching token for row ${row.id}`)
        return {
          accessToken: decryptSecret(row.access_token),
          recurringId: typeof row.id === 'string' ? row.id : '',
          manageUri: typeof row.manage_uri === 'string' && row.manage_uri.length > 0 ? decryptSecret(row.manage_uri) : '',
        }
      }
    } catch (err) {
      console.error(`[mock-trigger] Error processing row ${row.id}:`, err)
      continue
    }
  }

  // Fallback: try without donor_name filter to see if the row exists under a different name
  const { data: allRows, error: allError } = await admin
    .from('recurring_contributions')
    .select('id,access_token,manage_uri,member_wallet_address,donor_name,status,updated_at')
    .in('status', ['active', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(20)

  if (!allError && allRows.length > 0) {
    console.log(`[mock-trigger] Fallback: found ${allRows.length} total active/paused recurring_contributions`)
    for (const row of allRows) {
      const rowWallet = typeof row.member_wallet_address === 'string' ? row.member_wallet_address : ''
      console.log(`[mock-trigger] All-row id=${row.id} wallet="${rowWallet}" donor_name="${row.donor_name}" status="${row.status}" has_token=${Boolean(row.access_token)}`)

      if (!rowWallet) continue

      try {
        const normalizedRowWallet = normalizeWalletAddress(rowWallet)
        if (normalizedRowWallet !== donorWalletAddress) continue

        if (typeof row.access_token === 'string' && row.access_token.length > 0) {
          console.log(`[mock-trigger] ✅ Found matching token via fallback (donor_name="${row.donor_name}") for row ${row.id}`)
          return {
            accessToken: decryptSecret(row.access_token),
            recurringId: typeof row.id === 'string' ? row.id : '',
            manageUri: typeof row.manage_uri === 'string' && row.manage_uri.length > 0 ? decryptSecret(row.manage_uri) : '',
          }
        }
      } catch {
        continue
      }
    }
  } else {
    console.log(`[mock-trigger] Fallback: no active/paused recurring_contributions found at all (error: ${allError?.message ?? 'none'})`)
  }

  console.warn('[mock-trigger] ❌ No valid mock donor access token found, will trigger bootstrap approval')

  return {
    accessToken: '',
    recurringId: '',
    manageUri: '',
  }
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
    let tokenState = await resolveMockDonorAccessToken(admin, donorWalletAddress, envDonorAccessToken)

    if (!tokenState.accessToken) {
      return createBootstrapApproval(admin, user.id, donorWalletAddress, poolWallet.assetCode)
    }

    // Keep individual mock payments small relative to the grant limit
    // so many payments fit within one approval cycle
    const amount = randomAmount(Math.max(100, Math.floor(bootstrapAmount / 10)))
    const donorName = pickRandom(MOCK_NAMES)
    const donorCountry = pickRandom(MOCK_COUNTRIES)

    let payment
    try {
      payment = await processRecurringContribution({
        memberWalletAddress: donorWalletAddress,
        amount,
        currency: poolWallet.assetCode,
        accessToken: tokenState.accessToken,
        // Quote by receiveAmount (SGD) so the pool wallet gets the exact amount
        // and the incoming payment is created with the correct SGD value.
        // The USD debit is calculated automatically by the ILP connector.
        quoteByDebitAmount: false,
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
        || message.includes('403')
        || message.includes('401')

      if (!isGrantFailure) {
        throw paymentErr
      }

      console.warn('Mock payment grant failure, attempting recovery:', message)

      if (envDonorAccessToken) {
        return NextResponse.json({
          error: 'MOCK_DONOR_ACCESS_TOKEN is invalid or insufficient. Refresh token or remove it to use bootstrap approval flow.',
        }, { status: 401 })
      }

      // Try token rotation — works with interval-based grants where the token
      // has expired but the grant itself is still valid
      if (tokenState.manageUri && tokenState.recurringId) {
        try {
          console.log('Attempting mock donor token rotation via manage URI...')
          const rotated = await rotateAccessToken({
            manageUri: tokenState.manageUri,
            accessToken: tokenState.accessToken,
          })

          const { error: updateTokenError } = await admin
            .from('recurring_contributions')
            .update({
              access_token: encryptSecret(rotated.accessToken),
              manage_uri: encryptSecret(rotated.manageUri),
              updated_at: new Date().toISOString(),
            })
            .eq('id', tokenState.recurringId)

          if (updateTokenError) {
            console.error('Failed to persist rotated token, falling back to bootstrap:', updateTokenError.message)
            return createBootstrapApproval(admin, user.id, donorWalletAddress, poolWallet.assetCode)
          }

          tokenState = {
            accessToken: rotated.accessToken,
            recurringId: tokenState.recurringId,
            manageUri: rotated.manageUri,
          }

          console.log('Token rotated successfully, retrying payment...')
          payment = await processRecurringContribution({
            memberWalletAddress: donorWalletAddress,
            amount,
            currency: poolWallet.assetCode,
            accessToken: tokenState.accessToken,
            quoteByDebitAmount: false,
            metadata: {
              source: 'mock-key-trigger',
              initiatedBy: user.id,
              rotated: 'true',
            },
          })
        } catch (rotationErr) {
          // Token is fully consumed or revoked — new bootstrap needed
          console.error('Token rotation/retry failed, requesting new bootstrap approval:', rotationErr instanceof Error ? rotationErr.message : rotationErr)
          return createBootstrapApproval(admin, user.id, donorWalletAddress, poolWallet.assetCode)
        }

        if (!payment) {
          return createBootstrapApproval(admin, user.id, donorWalletAddress, poolWallet.assetCode)
        }
      } else {
        // No manage URI saved — can't rotate, must re-bootstrap
        return createBootstrapApproval(admin, user.id, donorWalletAddress, poolWallet.assetCode)
      }
    }

    // For mock donations: if the outgoing payment was created successfully,
    // treat it as completed. Polling via getOutgoingPaymentStatus uses
    // unauthenticated fetch which returns 400 on the testnet.
    // The payment is already processing on the ILP network.
    const paymentFailed = payment.status === 'failed'
    if (paymentFailed) {
      return NextResponse.json({ error: 'Mock donation outgoing payment failed' }, { status: 502 })
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
