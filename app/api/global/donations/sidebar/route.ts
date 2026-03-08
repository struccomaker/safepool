export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import { getPoolWalletMetadata } from '@/lib/open-payments'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

interface SidebarDonationItem {
  id: string
  member: string
  country: string
  is_anonymous: boolean
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
        .select('id,member_id,donor_name,is_anonymous,donor_country,amount,currency,contributed_at')
        .eq('pool_id', GLOBAL_POOL_ID)
        .eq('status', 'completed')
        .gt('amount', 0)
        .order('contributed_at', { ascending: false })
        .limit(6),
      admin
        .from('contributions')
        .select('amount')
        .eq('pool_id', GLOBAL_POOL_ID)
        .eq('status', 'completed'),
    ])

    if (contributionsResult.error) {
      return NextResponse.json({ error: `Failed to load contributions feed: ${contributionsResult.error.message}` }, { status: 500 })
    }

    if (payoutsResult.error) {
      return NextResponse.json({ error: `Failed to load contribution totals: ${payoutsResult.error.message}` }, { status: 500 })
    }

    const totalIn = payoutsResult.data.reduce((sum, row) => sum + Number(row.amount), 0)
    const currentPoolBalance = Math.max(0, totalIn)

    const donations: SidebarDonationItem[] = contributionsResult.data.map((row) => ({
      id: row.id,
      member: row.is_anonymous ? 'anon' : (row.donor_name?.trim() || toDisplayMember(row.member_id)),
      country: typeof row.donor_country === 'string' && /^[A-Za-z]{2}$/.test(row.donor_country)
        ? row.donor_country.trim().toUpperCase()
        : 'SG',
      is_anonymous: Boolean(row.is_anonymous),
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
        total_out: 0,
      },
    })
  } catch (err: unknown) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
