import { NextResponse } from 'next/server'
import { getClient, getPoolWalletMetadata } from '@/lib/open-payments'
import { encryptSecret, decryptSecret } from '@/lib/secret-crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

/**
 * Callback for completing the interactive grant flow
 * This is called after the user authorizes the grant in their browser
 * 
 * GET /api/pool-wallet/grant-callback?grant_id=xxx&interact_ref=xxx
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const grantId = searchParams.get('grant_id')
        const interactRef = searchParams.get('interact_ref')

        if (!grantId || !interactRef) {
            return NextResponse.redirect(new URL('/?error=missing_params', req.url))
        }

        const admin = createSupabaseAdminClient()

        // Get the pending grant session
        const { data: sessionRows, error: sessionError } = await admin
            .from('payment_grant_sessions')
            .select('*')
            .eq('id', grantId)
            .eq('status', 'pending')
            .limit(1)

        if (sessionError || !sessionRows || sessionRows.length === 0) {
            return NextResponse.redirect(new URL('/?error=session_not_found', req.url))
        }

        const session = sessionRows[0]

        // Continue the grant
        const client = await getClient()

        const continuation = await client.grant.continue(
            { url: session.continue_uri, accessToken: decryptSecret(session.continue_access_token) },
            { interact_ref: interactRef }
        )

        if (!('access_token' in continuation) || !continuation.access_token) {
            return NextResponse.redirect(new URL('/?error=grant_continuation_failed', req.url))
        }

        // Parse the payload to get max_amount and currency
        const payload = JSON.parse(session.payload_json || '{}')
        const maxAmount = payload.max_amount || 1000000
        const currency = payload.currency || 'SGD'

        // Store with far-future expiry for disaster relief grants
        // The testnet may return short-lived tokens, but we treat this grant as long-lived
        // until the debit limit is hit
        const expiresAt = new Date('2099-12-31').toISOString()

        // Store the grant in pool_wallet_grants
        await admin.from('pool_wallet_grants').upsert({
            pool_id: GLOBAL_POOL_ID,
            access_token: encryptSecret(continuation.access_token.value),
            manage_uri: continuation.access_token.manage ? encryptSecret(continuation.access_token.manage) : '',
            max_amount: maxAmount,
            currency: currency,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'pool_id' })

        // Mark session as completed
        await admin
            .from('payment_grant_sessions')
            .update({ status: 'completed' })
            .eq('id', grantId)

        // Redirect to the app's site URL
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        return NextResponse.redirect(new URL('/?success=grant_configured', siteUrl))

    } catch (err: unknown) {
        console.error('[pool-grant-callback] Error:', err)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        return NextResponse.redirect(new URL('/?error=grant_callback_failed', siteUrl))
    }
}
