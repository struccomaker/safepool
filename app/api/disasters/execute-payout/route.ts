export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { getClient, getPoolWalletMetadata, toMinorUnits, formatOpenPaymentsError } from '@/lib/open-payments'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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

// ── Send a single payout from pool → family wallet ────────────────────────────

async function sendPayoutToWallet(
    familyWalletAddress: string,
    amount: number,
    payoutId: string,
    familyIndex: number
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

        // Approximate FX rates from SGD to common testnet currencies
        const fxRates: Record<string, number> = {
            'USD': 0.74,
            'EUR': 0.68,
            'GBP': 0.58,
            'SGD': 1.0,
        }
        const rate = fxRates[familyWallet.assetCode] || 1.0
        const foreignAmount = amount * rate

        // 2. Create incoming payment on family wallet (specific receive amount)
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

        console.log(`[payout] Incoming payment created: ${incomingPayment.id} for ${foreignAmount.toFixed(2)} ${familyWallet.assetCode}`)

        // 3. Get outgoing-payment + quote grant on pool wallet (interactive if required)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outgoingGrant = await client.grant.request(
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
                                    value: toMinorUnits(amount * 2, poolWallet.assetScale), // buffer for slip
                                    assetCode: poolWallet.assetCode,
                                    assetScale: poolWallet.assetScale,
                                },
                            },
                        },
                    ] as any,
                },
                interact: {
                    start: ['redirect'],
                    finish: {
                        method: 'redirect',
                        uri: `http://localhost:3000/api/payments/callback?flow=outgoing&payout_id=${payoutId}`,
                        nonce: crypto.randomUUID(),
                    },
                },
            }
        )

        // The grant flow requires completing interaction before we get an access_token.
        // Wait, for backend automated payout, we need a NON-INTERACTIVE grant config
        // or an pre-authorized token for the pool wallet.
        // If it returns interaction required, we cannot proceed synchronously!

        // Actually, if it's the SafePool pool wallet acting autonomously, it should ideally
        // be configured not to require interaction, but testnets often require it no matter what unless configured specially.
        // Or we pass the interact block and if it returns an interaction_url, we just log it.

        let outAccessToken: string
        if ('access_token' in outgoingGrant && outgoingGrant.access_token) {
            outAccessToken = (outgoingGrant as { access_token: { value: string } }).access_token.value
        } else {
            return { success: false, error: 'Outgoing grant requires user interaction — pool wallet needs non-interactive grants for automated payouts' }
        }

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

        // ── 1. Send funds to family wallets ───────────────────────────────────

        const familyWallets = getFamilyWallets()
        const transferResults: Array<{ wallet: string; success: boolean; outgoingPaymentId?: string; error?: string }> = []

        if (familyWallets.length === 0) {
            console.warn('[payout] No FAMILY_WALLET_1..4 env vars configured — skipping ILP transfers, still recording deductions.')
        } else {
            for (let i = 0; i < familyWallets.length; i++) {
                const result = await sendPayoutToWallet(familyWallets[i], perMemberPayout, payoutId, i)
                transferResults.push({ wallet: familyWallets[i], ...result })
            }
            const ok = transferResults.filter((r) => r.success).length
            console.log(`[payout] ${ok}/${familyWallets.length} transfers succeeded`)
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
