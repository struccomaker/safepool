export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { getClient, getPoolWalletMetadata, toMinorUnits, formatOpenPaymentsError, rotateAccessToken } from '@/lib/open-payments'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto'

// ── Configuration ─────────────────────────────────────────────────────────────

const AFFECTED_FAMILIES = 4

/** Read the 4 family wallet addresses from env. */
function getFamilyWallets(): string[] {
    const wallets: string[] = []
    for (let i = 1; i <= AFFECTED_FAMILIES; i++) {
        let raw = process.env[`FAMILY_WALLET_${i}`]?.trim()
        if (!raw) continue

        // Strip ILP "$" prefix
        if (raw.startsWith('$')) raw = raw.slice(1)

        // dotenv expands "$ilp..." as a variable → empty, leaving ".interledger-test.dev/..."
        // Fix: re-prepend "ilp" if the value starts with ".interledger"
        if (raw.startsWith('.interledger')) raw = `ilp${raw}`

        // Ensure https:// prefix
        if (!raw.startsWith('https://')) raw = `https://${raw}`

        wallets.push(raw)
    }
    return wallets
}

// ── Severity multiplier (mirrors demo-payout) ─────────────────────────────────

function calcSeverityMultiplier(magnitude: number): number {
    return Math.max(0.25, Math.min(1.0, 0.5 + (magnitude - 6.0) * 0.25))
}

// ── Load stored pool wallet grant for automated payouts ───────────────────────

interface PoolWalletGrant {
    accessToken: string
    manageUri: string
    grantId: string | null
    maxAmount: number
    currency: string
    expiresAt: Date
}

interface GrantResult {
    grant: PoolWalletGrant | null
    grantId?: string | null
    interactionRequired: boolean
    redirectUrl?: string
    message?: string
}

async function getStoredPoolGrant(): Promise<PoolWalletGrant | null> {
    const admin = createSupabaseAdminClient()
    
    const { data: grantRows, error } = await admin
        .from('pool_wallet_grants')
        .select('id, access_token, manage_uri, max_amount, currency, expires_at')
        .limit(1)

    if (error) {
        console.log(`[payout] Grant query error:`, error.message)
        return null
    }
    
    if (!grantRows || grantRows.length === 0) {
        console.log(`[payout] No stored pool wallet grant found (table empty)`)
        return null
    }

    const grant = grantRows[0]
    
    // For disaster relief, we trust stored grants unless they hit the debit limit
    // The actual token validity is checked by the auth server when used
    // So we don't check expiresAt - just return the grant and let the server validate it
    return {
        accessToken: decryptSecret(grant.access_token),
        manageUri: grant.manage_uri ? decryptSecret(grant.manage_uri) : '',
        grantId: grantRows[0].id || null,
        maxAmount: Number(grant.max_amount),
        currency: grant.currency,
        expiresAt: new Date('2099-12-31'), // Far future, trust the grant unless it fails
    }
}

// Get or create pool wallet grant - mirrors mock-trigger pattern
async function getOrCreatePoolGrant(): Promise<GrantResult> {
    // First check for stored grant
    const storedGrant = await getStoredPoolGrant()
    if (storedGrant) {
        return { grant: storedGrant, interactionRequired: false }
    }

    // No stored grant - need to create one
    console.log(`[payout] No stored grant found, creating new one...`)
    
    const client = await getClient()
    const poolMeta = await getPoolWalletMetadata()
    const poolWallet = await client.walletAddress.get({ url: poolMeta.walletAddress })
    
    // Default to $1,000,000 for disaster relief
    const maxAmount = Number(process.env.POOL_WALLET_GRANT_MAX_AMOUNT || '1000000')
    const currency = poolWallet.assetCode || 'SGD'
    const grantId = crypto.randomUUID()

    try {
        const grant = await client.grant.request(
            { url: poolWallet.authServer },
            {
                access_token: {
                    access: [
                        { type: 'quote', actions: ['create', 'read'] },
                        {
                            type: 'outgoing-payment',
                            actions: ['read', 'create', 'list'],
                            identifier: poolWallet.id,
                            limits: {
                                debitAmount: {
                                    value: toMinorUnits(maxAmount * 1.5, poolWallet.assetScale),
                                    assetCode: poolWallet.assetCode,
                                    assetScale: poolWallet.assetScale,
                                },
                            },
                        },
                    ],
                },
                interact: {
                    start: ['redirect'],
                    finish: {
                        method: 'redirect',
                        uri: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/pool-wallet/grant-callback?grant_id=${grantId}`,
                        nonce: crypto.randomUUID(),
                    },
                },
            }
        )

        // Check if non-interactive (immediate access token)
        if ('access_token' in grant && grant.access_token && 'value' in grant.access_token) {
            // Store with far-future expiry for disaster relief grants
            const expiresAt = new Date('2099-12-31')

            const admin = createSupabaseAdminClient()
            await admin.from('pool_wallet_grants').upsert({
                pool_id: GLOBAL_POOL_ID,
                access_token: encryptSecret(grant.access_token.value),
                manage_uri: grant.access_token.manage ? encryptSecret(grant.access_token.manage) : '',
                max_amount: maxAmount,
                currency: currency,
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'pool_id' })

            console.log(`[payout] Non-interactive grant created and stored`)
            return {
                grant: {
                    accessToken: grant.access_token.value,
                    manageUri: grant.access_token.manage || '',
                    grantId: grantId,
                    maxAmount,
                    currency,
                    expiresAt,
                },
                interactionRequired: false,
            }
        }

        // Interactive grant - return redirect URL for user to approve once
        if ('interact' in grant && grant.interact && 'redirect' in grant.interact) {
            // Store the continue info for callback
            const admin = createSupabaseAdminClient()
            const finishNonce = crypto.randomUUID()
            
            await admin.from('payment_grant_sessions').upsert({
                id: grantId,
                flow: 'outgoing',
                reference_id: grantId,
                continue_uri: ('continue' in grant && grant.continue ? grant.continue.uri : ''),
                continue_access_token: ('continue' in grant && grant.continue ? encryptSecret(grant.continue.access_token.value) : ''),
                finish_nonce: finishNonce,
                payload_json: JSON.stringify({
                    pool_id: GLOBAL_POOL_ID,
                    max_amount: maxAmount,
                    currency: currency,
                }),
                status: 'pending',
            }, { onConflict: 'id' })

            console.log(`[payout] Interaction required for grant`)
            return {
                grant: null,
                interactionRequired: true,
                redirectUrl: grant.interact.redirect,
                message: 'Grant approval required. Approve once, subsequent payouts will work automatically.',
            }
        }

        return {
            grant: null,
            interactionRequired: true,
            message: 'Invalid grant response from auth server',
        }

    } catch (err) {
        console.error(`[payout] Grant creation failed:`, err instanceof Error ? err.message : 'Unknown error')
        return {
            grant: null,
            interactionRequired: true,
            message: `Failed to create grant: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }
    }
}

// ── Send a single payout from pool → family wallet ────────────────────────────

async function sendPayoutToWallet(
    familyWalletAddress: string,
    amount: number,
    payoutId: string,
    familyIndex: number,
    poolAccessToken: string
): Promise<{ success: boolean; outgoingPaymentId?: string; error?: string }> {
    try {
        const client = await getClient()
        const poolMeta = await getPoolWalletMetadata()

        const poolWallet = await client.walletAddress.get({ url: poolMeta.walletAddress })
        const familyWallet = await client.walletAddress.get({ url: familyWalletAddress })

        console.log(`[payout] Family ${familyIndex + 1}: ${familyWalletAddress} (${familyWallet.assetCode})`)

        // 1. Get incoming-payment grant on family wallet (non-interactive)
        const incomingGrant = await client.grant.request(
            { url: familyWallet.authServer },
            {
                access_token: {
                    access: [{ type: 'incoming-payment', actions: ['create', 'read'] }],
                },
            }
        )

        if (!('access_token' in incomingGrant) || !incomingGrant.access_token) {
            return { success: false, error: 'Could not get incoming-payment grant on family wallet' }
        }

        const incomingAccessToken = (incomingGrant as { access_token: { value: string } }).access_token.value

        // Calculate foreign amounts that result in the same SGD debit for all families
        // Using fixed demo rates - in production, use real-time FX API
        const demoFxRates: Record<string, number> = {
            'EUR': 1.47,   // SGD per EUR
            'USD': 1.28,   // SGD per USD
            'GBP': 1.72,   // SGD per GBP
            'SGD': 1.0,    // SGD per SGD
        }
        const rate = demoFxRates[familyWallet.assetCode] || 1.0
        // Calculate foreign amount so pool debits exactly `amount` SGD
        const foreignAmount = Math.round((amount / rate) * 100) / 100

        // 2. Create incoming payment with foreign receive amount
        const incomingPayment = await client.incomingPayment.create(
            { url: familyWallet.resourceServer, accessToken: incomingAccessToken },
            {
                walletAddress: familyWallet.id,
                incomingAmount: {
                    value: toMinorUnits(foreignAmount, familyWallet.assetScale),
                    assetCode: familyWallet.assetCode,
                    assetScale: familyWallet.assetScale,
                },
                expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            }
        )

        console.log(`[payout] Incoming payment: ${incomingPayment.id} for ${foreignAmount.toFixed(2)} ${familyWallet.assetCode}`)

        // 3. Use the passed pool wallet access token (already validated)
        const outAccessToken = poolAccessToken
        console.log(`[payout] Using pool grant token for outgoing payment`)

        // 4. Create quote — ILP will calculate the exact SGD debitAmount required to fulfill the foreign receiveAmount
        const quote = await client.quote.create(
            { url: poolWallet.resourceServer, accessToken: outAccessToken },
            {
                walletAddress: poolWallet.id,
                receiver: incomingPayment.id,
                method: 'ilp',
            }
        )

        console.log(`[payout] Quote: debit=${JSON.stringify(quote.debitAmount)} receive=${JSON.stringify(quote.receiveAmount)}`)

        // 5. Create outgoing payment
        const outgoingPayment = await client.outgoingPayment.create(
            { url: poolWallet.resourceServer, accessToken: outAccessToken },
            {
                walletAddress: poolWallet.id,
                quoteId: quote.id,
            }
        )

        console.log(`[payout] Outgoing payment: id=${outgoingPayment.id} failed=${outgoingPayment.failed}`)

        return { success: !outgoingPayment.failed, outgoingPaymentId: outgoingPayment.id }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        const fullMsg = typeof err === 'object' && err !== null && 'message' in err
            ? formatOpenPaymentsError(err)
            : message
        console.error(`[payout] Family ${familyIndex + 1} failed:`, fullMsg)
        return { success: false, error: fullMsg }
    }
}

// ── POST /api/disasters/execute-payout ────────────────────────────────────────

export async function POST(req: Request) {
    try {
        // Auth check
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Parse the payout parameters from request body (sent by the overlay)
        const body = await req.json() as {
            magnitude?: number
            per_member_payout?: number
            total_payout?: number
            safety_cap?: number
            severity_multiplier?: number
            pool_balance?: number
        }

        const magnitude = Number(body.magnitude ?? 7.4)
        const perMemberPayout = Number(body.per_member_payout ?? 0)
        const totalPayout = Number(body.total_payout ?? 0)
        const poolBalance = Number(body.pool_balance ?? 0)

        if (perMemberPayout <= 0) {
            return NextResponse.json({ error: 'per_member_payout must be > 0' }, { status: 400 })
        }

        const admin = createSupabaseAdminClient()
        const payoutId = crypto.randomUUID()

        // Find the member ID for the triggering user to satisfy FK constraint on contributions table
        const { data: memberRows, error: memberErr } = await admin
            .from('members')
            .select('id')
            .eq('user_id', user.id)
            .eq('pool_id', GLOBAL_POOL_ID)
            .limit(1)

        if (memberErr || !memberRows || memberRows.length === 0) {
            return NextResponse.json({ error: 'User must be a member of the pool to trigger payouts' }, { status: 400 })
        }
        const memberIdTrigger = memberRows[0].id

        console.log(`[payout] Starting: total=${totalPayout} perFamily=${perMemberPayout} families=${AFFECTED_FAMILIES}`)

        // ── 0. Check/get pool wallet grant (same pattern as mock-trigger) ───────
        const grantResult = await getOrCreatePoolGrant()
        
        if (grantResult.interactionRequired) {
            // Return redirect URL for user to approve grant
            return NextResponse.json({
                error: grantResult.message || 'Pool wallet grant requires authorization',
                mode: 'interaction_required',
                redirectUrl: grantResult.redirectUrl,
            }, { status: 202 })
        }

        const poolAccessToken = grantResult.grant!.accessToken
        const poolManageUri = grantResult.grant!.manageUri
        const poolGrantId = grantResult.grant?.grantId || null

        // ── 1. Send funds to family wallets ───────────────────────────────────

        const familyWallets = getFamilyWallets()
        let transferResults: Array<{ wallet: string; success: boolean; outgoingPaymentId?: string; error?: string }> = []

        if (familyWallets.length === 0) {
            console.warn('[payout] No FAMILY_WALLET_1..4 env vars configured — skipping ILP transfers, still recording deductions.')
        } else {
            let currentToken = poolAccessToken
            let tokenRotated = false
            
            for (let i = 0; i < familyWallets.length; i++) {
                let result = await sendPayoutToWallet(familyWallets[i], perMemberPayout, payoutId, i, currentToken)
                
                // If token is inactive, try rotation once
                if (!result.success && result.error?.includes('Inactive Token') && poolManageUri && !tokenRotated) {
                    console.log(`[payout] Token inactive, attempting rotation...`)
                    try {
                        const rotated = await rotateAccessToken({
                            manageUri: poolManageUri,
                            accessToken: currentToken,
                        })
                        
                        // Update stored token
                        await admin.from('pool_wallet_grants').upsert({
                            pool_id: GLOBAL_POOL_ID,
                            access_token: encryptSecret(rotated.accessToken),
                            manage_uri: encryptSecret(rotated.manageUri),
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'pool_id' })
                        
                        currentToken = rotated.accessToken
                        tokenRotated = true
                        console.log(`[payout] Token rotated, retrying...`)
                        
                        // Retry with new token
                        result = await sendPayoutToWallet(familyWallets[i], perMemberPayout, payoutId, i, currentToken)
                    } catch (rotationErr) {
                        console.error(`[payout] Token rotation failed:`, rotationErr instanceof Error ? rotationErr.message : 'Unknown error')
                    }
                }
                
                transferResults.push({ wallet: familyWallets[i], ...result })
            }
            const ok = transferResults.filter((r) => r.success).length
            console.log(`[payout] ${ok}/${familyWallets.length} transfers succeeded`)
            
            // If all failed and we couldn't rotate, request a new grant
            if (ok === 0 && !tokenRotated) {
                console.log(`[payout] All transfers failed, requesting new grant...`)
                
                // Delete the invalid grant
                await admin.from('pool_wallet_grants').delete().eq('pool_id', GLOBAL_POOL_ID)
                
                // Request a new grant
                const newGrantResult = await getOrCreatePoolGrant()
                
                if (newGrantResult.interactionRequired) {
                    // Need user to authorize new grant
                    return NextResponse.json({
                        error: newGrantResult.message || 'Need to re-authorize pool wallet grant',
                        mode: 'interaction_required',
                        redirectUrl: newGrantResult.redirectUrl,
                    }, { status: 202 })
                }
                
                // Retry with new token
                const newToken = newGrantResult.grant!.accessToken
                console.log(`[payout] Got new grant, retrying transfers...`)
                
                for (let i = 0; i < familyWallets.length; i++) {
                    const result = await sendPayoutToWallet(familyWallets[i], perMemberPayout, payoutId, i, newToken)
                    transferResults[i] = { wallet: familyWallets[i], ...result }
                }
                
                const okRetry = transferResults.filter((r) => r.success).length
                console.log(`[payout] Retry: ${okRetry}/${familyWallets.length} transfers succeeded`)
            }
        }

        // ── 2. Deduct total payout from pool ───────────────────────────

        const now = new Date().toISOString()
        const { error: insErr } = await admin.from('contributions').insert({
            id: crypto.randomUUID(),
            pool_id: GLOBAL_POOL_ID,
            member_id: memberIdTrigger, // Uses the valid member ID
            donor_name: 'SafePool Disaster Relief',
            is_anonymous: false,
            donor_country: 'SG',
            amount: -totalPayout, // Single flat deduction for total payout
            currency: 'SGD',
            incoming_payment_id: `payout:${payoutId}`,
            contributed_at: now,
            status: 'completed',
        })

        if (insErr) {
            console.error('[payout] Deduction insert failed:', insErr.message)
            return NextResponse.json({ error: `Deduction insert failed: ${insErr.message}` }, { status: 500 })
        }


        return NextResponse.json({
            payoutId,
            totalPayout: Math.round(totalPayout * 100) / 100,
            perFamily: Math.round(perMemberPayout * 100) / 100,
            familiesAffected: AFFECTED_FAMILIES,
            deductionsRecorded: 1,
            transfers: transferResults,
        })
    } catch (err) {
        console.error('[payout] Error:', err)
        const message = err instanceof Error ? err.message : 'Internal error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
