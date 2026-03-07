export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { GLOBAL_POOL_CONFIG, GLOBAL_POOL_ID } from '@/lib/global-pool'

export async function GET() {
  try {
    return NextResponse.json({
      id: GLOBAL_POOL_ID,
      name: GLOBAL_POOL_CONFIG.name,
      description: GLOBAL_POOL_CONFIG.description,
      created_by: null,
      distribution_model: GLOBAL_POOL_CONFIG.distribution_model,
      contribution_frequency: 'monthly',
      contribution_amount: 0,
      currency: GLOBAL_POOL_CONFIG.currency,
      trigger_rules: GLOBAL_POOL_CONFIG.trigger_rules,
      governance_rules: {
        quorum_pct: 50,
        vote_threshold: 60,
      },
      payout_cap: GLOBAL_POOL_CONFIG.payout_cap,
      created_at: new Date().toISOString(),
      is_active: true,
    })
  } catch (err: unknown) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch pool' }, { status: 500 })
  }
}
