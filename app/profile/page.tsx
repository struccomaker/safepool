// Server Component — user wallet + contribution history
import { queryRows } from '@/lib/clickhouse'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import type { Contribution, UserWallet } from '@/types'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import WalletSetupForm from '@/components/WalletSetupForm'

async function getUserContributions(userId: string): Promise<Contribution[]> {
  try {
    const rows = await queryRows<{
      id: string
      pool_id: string
      member_id: string
      amount: number
      currency: string
      incoming_payment_id: string
      contributed_at: string
      status: string
    }>(
      `
      SELECT
        toString(c.id) AS id,
        toString(c.pool_id) AS pool_id,
        toString(c.member_id) AS member_id,
        c.amount,
        c.currency,
        c.incoming_payment_id,
        c.contributed_at,
        c.status
      FROM contributions c
      ANY INNER JOIN (
        SELECT id
        FROM members
        WHERE user_id = toUUID({user_id:String})
          AND pool_id = toUUID({pool_id:String})
          AND is_active = 1
      ) m ON c.member_id = m.id
      WHERE c.pool_id = toUUID({pool_id:String})
      ORDER BY c.contributed_at DESC
      LIMIT 50
      `,
      {
        user_id: userId,
        pool_id: GLOBAL_POOL_ID,
      }
    )

    return rows as Contribution[]
  } catch {
    return []
  }
}

async function getWallet(userId: string): Promise<UserWallet | null> {
  try {
    const rows = await queryRows<{
      id: string
      user_id: string
      wallet_address: string
      provider: string
      status: string
      is_default: number
      created_at: string
    }>(
      `
      SELECT
        toString(id) AS id,
        toString(user_id) AS user_id,
        wallet_address,
        provider,
        toString(status) AS status,
        is_default,
        toString(created_at) AS created_at
      FROM user_wallets
      WHERE user_id = toUUID({user_id:String})
        AND is_default = 1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      { user_id: userId }
    )

    if (rows.length === 0) return null
    return rows[0] as UserWallet
  } catch {
    return null
  }
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-4">Profile</h1>
        <p className="text-white/50">You must be signed in to view your profile.</p>
      </div>
    )
  }

  const [wallet, history] = await Promise.all([
    getWallet(user.id),
    getUserContributions(user.id),
  ])

  const displayName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name
    : user.email?.split('@')[0]

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Profile</h1>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/40">Name</span>
            <span>{displayName ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Email</span>
            <span>{user.email ?? '—'}</span>
          </div>
        </div>
      </div>

      <WalletSetupForm
        currentWalletAddress={wallet?.wallet_address ?? null}
        walletStatus={wallet?.status ?? null}
      />

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Contribution History</h2>
        {history.length === 0 && (
          <p className="text-white/30 text-sm">No contributions yet.</p>
        )}
        <div className="space-y-3">
          {history.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <div className="text-sm font-mono">{c.pool_id}</div>
                <div className="text-xs text-white/30">{new Date(c.contributed_at).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-green-400 font-mono">${c.amount} {c.currency}</div>
                <div className={`text-xs capitalize ${c.status === 'completed' ? 'text-green-400' : c.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                  {c.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
