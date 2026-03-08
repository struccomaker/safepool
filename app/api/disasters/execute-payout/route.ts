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

        // 2. Create incoming payment on family wallet (receive amount)
        const incomingPayment = await client.incomingPayment.create(
            { url: familyWallet.resourceServer, accessToken: incomingAccessToken },
            {
                walletAddress: familyWallet.id,
                incomingAmount: {
                    value: toMinorUnits(amount, familyWallet.assetScale),
                    assetCode: familyWallet.assetCode,
                    assetScale: familyWallet.assetScale,
                },
                expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                metadata: { type: 'earthquake-relief', payoutId, familyIndex: String(familyIndex) },
            }
        )

        console.log(`[payout] Incoming payment created: ${incomingPayment.id}`)

        // 3. Get outgoing-payment + quote grant on pool wallet (non-interactive)
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
                                    value: toMinorUnits(amount * 2, poolWallet.assetScale),
                                    assetCode: poolWallet.assetCode,
                                    assetScale: poolWallet.assetScale,
                                },
                            },
                        },
                    ] as any,
                },
            }
        )

        if (!('access_token' in outgoingGrant) || !outgoingGrant.access_token) {
            return { success: false, error: 'Outgoing grant requires interaction — pool wallet needs non-interactive grants' }
        }

        const outAccessToken = (outgoingGrant as { access_token: { value: string } }).access_token.value

        // 4. Create quote
        const quote = await client.quote.create(
            { url: poolWallet.resourceServer, accessToken: outAccessToken },
            { walletAddress: poolWallet.id, receiver: incomingPayment.id, method: 'ilp' }
        )

        console.log(`[payout] Quote: debit=${JSON.stringify(quote.debitAmount)} receive=${JSON.stringify(quote.receiveAmount)}`)

        // 5. Create outgoing payment
        const outgoing = await client.outgoingPayment.create(
            { url: poolWallet.resourceServer, accessToken: outAccessToken },
            {
                walletAddress: poolWallet.id,
                quoteId: quote.id,
                metadata: { type: 'earthquake-relief-payout', payoutId, familyIndex: String(familyIndex) },
            }
        )

        console.log(`[payout] Outgoing payment: id=${outgoing.id} failed=${outgoing.failed}`)

        if (outgoing.failed) return { success: false, error: 'Outgoing payment marked as failed' }
        return { success: true, outgoingPaymentId: outgoing.id }
    } catch (err) {
        const msg = formatOpenPaymentsError(err)
        console.error(`[payout] Family ${familyIndex + 1} failed:`, msg)
        return { success: false, error: msg }
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

        // ── 2. Deduct contributions proportionally ───────────────────────────
        //
        // Each contributor loses (their_amount / poolBalance) × totalPayout
        // from their balance. Recorded as negative contribution entries.

        const { data: contribs, error: contribErr } = await admin
            .from('contributions')
            .select('id, amount, member_id, donor_name')
            .eq('pool_id', GLOBAL_POOL_ID)
            .eq('status', 'completed')

        if (contribErr) {
            throw new Error(`Failed to query contributions: ${contribErr.message}`)
        }

        const rows = contribs ?? []
        const actualPoolBalance = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
        const now = new Date().toISOString()

        const deductions: Array<{
            id: string; pool_id: string; member_id: string; donor_name: string
            is_anonymous: boolean; donor_country: string; amount: number; currency: string
            incoming_payment_id: string; contributed_at: string; status: string
        }> = []

        for (const c of rows) {
            const amt = Number(c.amount ?? 0)
            if (amt <= 0 || actualPoolBalance <= 0) continue
            const share = amt / actualPoolBalance
            const deductAmt = share * totalPayout
            if (deductAmt <= 0) continue

            deductions.push({
                id: crypto.randomUUID(),
                pool_id: GLOBAL_POOL_ID,
                member_id: c.member_id,
                donor_name: c.donor_name ?? 'Unknown',
                is_anonymous: false,
                donor_country: 'SG',
                amount: -deductAmt,
                currency: 'SGD',
                incoming_payment_id: `payout:${payoutId}`,
                contributed_at: now,
                status: 'completed',
            })
        }

        if (deductions.length > 0) {
            const { error: insErr } = await admin.from('contributions').insert(deductions)
            if (insErr) {
                console.error('[payout] Deduction insert failed:', insErr.message)
            } else {
                console.log(`[payout] Inserted ${deductions.length} deduction records`)
            }
        }

        return NextResponse.json({
            payoutId,
            totalPayout: Math.round(totalPayout * 100) / 100,
            perFamily: Math.round(perMemberPayout * 100) / 100,
            familiesAffected: AFFECTED_FAMILIES,
            deductionsRecorded: deductions.length,
            transfers: transferResults,
        })
    } catch (err) {
        console.error('[payout] Error:', err)
        const message = err instanceof Error ? err.message : 'Internal error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
