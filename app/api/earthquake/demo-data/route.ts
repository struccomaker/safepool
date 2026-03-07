export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const PAYOUT_RATIO = 0.3

export async function GET() {
    try {
        const supabase = await createSupabaseServerClient()
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const admin = createSupabaseAdminClient()

        // 1. Pool balance = SUM of all completed contributions in the global pool
        const { data: poolData, error: poolError } = await admin
            .from('contributions')
            .select('amount')
            .eq('pool_id', GLOBAL_POOL_ID)
            .eq('status', 'completed')

        if (poolError) {
            throw new Error(`Failed to query pool contributions: ${poolError.message}`)
        }

        const poolBalance = (poolData ?? []).reduce(
            (sum, row) => sum + Number(row.amount ?? 0),
            0
        )

        // 2. Resolve the current user's display name
        const displayName = typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : user.email?.split('@')[0] ?? ''

        // 3. User's total contribution = SUM where donor_name matches user's name
        let userContributed = 0
        if (displayName) {
            const { data: userContribData, error: userContribError } = await admin
                .from('contributions')
                .select('amount')
                .eq('pool_id', GLOBAL_POOL_ID)
                .eq('status', 'completed')
                .eq('donor_name', displayName)

            if (userContribError) {
                throw new Error(`Failed to query user contributions: ${userContribError.message}`)
            }

            userContributed = (userContribData ?? []).reduce(
                (sum, row) => sum + Number(row.amount ?? 0),
                0
            )
        }

        // 4. Count distinct contributors (affected donors)
        const { data: distinctContributors, error: distinctError } = await admin
            .from('contributions')
            .select('member_id')
            .eq('pool_id', GLOBAL_POOL_ID)
            .eq('status', 'completed')

        const uniqueMemberIds = new Set(
            (distinctContributors ?? []).map((r) => r.member_id)
        )
        const affected = uniqueMemberIds.size || 1

        // 5. Calculate payout values
        const totalPayout = poolBalance * PAYOUT_RATIO
        const userShare = userContributed * PAYOUT_RATIO

        return NextResponse.json({
            poolBalance: Math.round(poolBalance * 100) / 100,
            totalPayout: Math.round(totalPayout * 100) / 100,
            userContributed: Math.round(userContributed * 100) / 100,
            userShare: Math.round(userShare * 100) / 100,
            affected,
            payoutRatio: PAYOUT_RATIO,
        })
    } catch (err) {
        console.error('[earthquake/demo-data]', err)
        const message = err instanceof Error ? err.message : 'Internal error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
