export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { getClient, getPoolWalletMetadata, toMinorUnits, formatOpenPaymentsError } from '@/lib/open-payments'
import { encryptSecret } from '@/lib/secret-crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

interface SetupGrantBody {
    maxAmount: number
    currency: string
}

/**
 * Set up a pre-authorized outgoing-payment grant for the pool wallet.
 * This allows the pool to send money to family wallets without user interaction.
 * 
 * POST /api/pool-wallet/setup-grant
 * Body: { maxAmount: number, currency: string }
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const admin = createSupabaseAdminClient()

        // Verify user is an admin or pool manager
        const { data: memberRows } = await admin
            .from('members')
            .select('id,user_id')
            .eq('pool_id', GLOBAL_POOL_ID)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)

        if (!memberRows || memberRows.length === 0) {
            return NextResponse.json({ error: 'Only pool members can set up wallet grants' }, { status: 403 })
        }

        const body = await req.json() as SetupGrantBody
        
        // Use env var or fallback to 100,000 for disaster relief
        const defaultMaxAmount = Number(process.env.POOL_WALLET_GRANT_MAX_AMOUNT || '100000')
        const maxAmount = body.maxAmount || defaultMaxAmount
        const currency = body.currency || process.env.POOL_WALLET_GRANT_CURRENCY || 'SGD'

        if (!currency || typeof currency !== 'string') {
            return NextResponse.json({ error: 'currency is required' }, { status: 400 })
        }

        const client = await getClient()
        const poolMeta = await getPoolWalletMetadata()
        const poolWallet = await client.walletAddress.get({ url: poolMeta.walletAddress })

        console.log(`[pool-grant] Setting up outgoing-payment grant for pool wallet ${poolWallet.id}`)
        console.log(`[pool-grant] Max amount: ${maxAmount} ${currency}`)

        // Request an interactive grant with a high limit
        // The user completes this once in their browser, then we store the access token
        const grantId = crypto.randomUUID()
        const finishNonce = crypto.randomUUID()

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
                                    value: toMinorUnits(maxAmount * 1.5, poolWallet.assetScale), // 50% buffer
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
                        nonce: finishNonce,
                    },
                },
            }
        )

        // If non-interactive, save directly
        if ('access_token' in grant && grant.access_token) {
            const expiresAt = grant.access_token.expires_in 
                ? new Date(Date.now() + grant.access_token.expires_in * 1000).toISOString()
                : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year default

            await admin.from('pool_wallet_grants').upsert({
                pool_id: GLOBAL_POOL_ID,
                access_token: encryptSecret(grant.access_token.value),
                manage_uri: grant.access_token.manage ? encryptSecret(grant.access_token.manage) : '',
                max_amount: maxAmount,
                currency: currency.toUpperCase(),
                expires_at: expiresAt,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'pool_id' })

            return NextResponse.json({
                success: true,
                mode: 'ready',
                expiresAt,
            })
        }

        // If interactive, store the continue info for the callback
        if ('interact' in grant && grant.interact && 'continue' in grant && grant.continue) {
            const { error: sessionError } = await admin
                .from('payment_grant_sessions')
                .insert({
                    id: grantId,
                    flow: 'outgoing',
                    reference_id: grantId,
                    continue_uri: grant.continue.uri,
                    continue_access_token: encryptSecret(grant.continue.access_token.value),
                    finish_nonce: finishNonce,
                    payload_json: JSON.stringify({
                        pool_id: GLOBAL_POOL_ID,
                        max_amount: maxAmount,
                        currency: currency.toUpperCase(),
                    }),
                    status: 'pending',
                })

            if (sessionError) {
                return NextResponse.json({ error: `Failed to store grant session: ${sessionError.message}` }, { status: 500 })
            }

            return NextResponse.json({
                grantId,
                mode: 'interaction_required',
                redirectUrl: grant.interact.redirect,
                continueUri: grant.continue.uri,
                continueAccessToken: grant.continue.access_token.value,
                finishNonce,
            })
        }

        return NextResponse.json({ error: 'Invalid grant response' }, { status: 500 })

    } catch (err: unknown) {
        console.error('[pool-grant] Error:', err)
        const message = formatOpenPaymentsError(err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

/**
 * Get the current status of the pool wallet grant
 */
export async function GET() {
    try {
        const admin = createSupabaseAdminClient()

        const { data: grantRows, error } = await admin
            .from('pool_wallet_grants')
            .select('pool_id, max_amount, currency, expires_at, created_at, updated_at')
            .eq('pool_id', GLOBAL_POOL_ID)
            .limit(1)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!grantRows || grantRows.length === 0) {
            return NextResponse.json({ configured: false })
        }

        const grant = grantRows[0]
        const isExpired = new Date(grant.expires_at) < new Date()

        return NextResponse.json({
            configured: true,
            maxAmount: grant.max_amount,
            currency: grant.currency,
            expiresAt: grant.expires_at,
            isExpired,
            createdAt: grant.created_at,
        })

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
