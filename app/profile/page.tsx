// Server Component — user wallet + contribution history
import { GLOBAL_POOL_ID } from '@/lib/global-pool'
import type { Contribution, UserWallet } from '@/types'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import WalletSetupForm from '@/components/WalletSetupForm'

async function getUserContributions(userId: string): Promise<Contribution[]> {
  try {
    const admin = createSupabaseAdminClient()
    const { data: members, error: membersError } = await admin
      .from('members')
      .select('id')
      .eq('user_id', userId)
      .eq('pool_id', GLOBAL_POOL_ID)
      .eq('is_active', true)

    if (membersError) {
      return []
    }

    const memberIds = members.map((member) => member.id)
    if (memberIds.length === 0) {
      return []
    }

    const { data: rows, error } = await admin
      .from('contributions')
      .select('id,pool_id,member_id,amount,currency,incoming_payment_id,contributed_at,status')
      .eq('pool_id', GLOBAL_POOL_ID)
      .in('member_id', memberIds)
      .order('contributed_at', { ascending: false })
      .limit(50)

    if (error) {
      return []
    }

    return rows as Contribution[]
  } catch {
    return []
  }
}

async function getWallet(userId: string): Promise<UserWallet | null> {
  try {
    const admin = createSupabaseAdminClient()
    const { data: rows, error } = await admin
      .from('user_wallets')
      .select('id,user_id,wallet_address,provider,status,is_default,created_at')
      .eq('user_id', userId)
      .eq('is_default', true)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      return null
    }

    if (rows.length === 0) return null
    return {
      ...(rows[0] as UserWallet),
      is_default: 1,
    }
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
