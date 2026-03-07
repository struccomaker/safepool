export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { getPoolWalletMetadata } from '@/lib/open-payments'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

interface SidebarDonationItem {
  id: string
  member: string
  amount: number
  currency: string
  contributed_at: string
}

function toDisplayMember(memberId: string): string {
  if (memberId.length <= 12) {
    return `Member ${memberId}`
  }
  return `Member ${memberId.slice(0, 6)}...${memberId.slice(-4)}`
}

export async function GET() {
  try {
    const admin = createSupabaseAdminClient()
    const [walletMetadata, contributionsResult, payoutsResult] = await Promise.all([
      getPoolWalletMetadata(),
      admin
        .from('contributions')
        .select('id,member_id,amount,currency,contributed_at')
        .eq('pool_id', GLOBAL_POOL_ID)
        .eq('status', 'completed')
        .order('contributed_at', { ascending: false })
        .limit(6),
      admin
        .from('payouts')
        .select('amount,status')
        .eq('pool_id', GLOBAL_POOL_ID)
        .in('status', ['processing', 'completed']),
    ])

    if (contributionsResult.error) {
      return NextResponse.json({ error: `Failed to load contributions feed: ${contributionsResult.error.message}` }, { status: 500 })
    }

    if (payoutsResult.error) {
      return NextResponse.json({ error: `Failed to load payout totals: ${payoutsResult.error.message}` }, { status: 500 })
    }

    const totalIn = contributionsResult.data.reduce((sum, row) => sum + Number(row.amount), 0)
    const totalOut = payoutsResult.data.reduce((sum, row) => sum + Number(row.amount), 0)
    const currentPoolBalance = Math.max(0, totalIn - totalOut)

    const donations: SidebarDonationItem[] = contributionsResult.data.map((row) => ({
      id: row.id,
      member: toDisplayMember(row.member_id),
      amount: Number(row.amount),
      currency: row.currency,
      contributed_at: row.contributed_at,
    }))

    return NextResponse.json({
      wallet: {
        address: walletMetadata.walletAddress,
        assetCode: walletMetadata.assetCode,
        assetScale: walletMetadata.assetScale,
      },
      current_pool_balance: currentPoolBalance,
      donations,
      totals: {
        total_in: totalIn,
        total_out: totalOut,
      },
    })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
