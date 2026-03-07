// Server Component — user wallet + contribution history
import type { Contribution } from '@/types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

async function getHistory(): Promise<Contribution[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/payments/history/all`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Failed')
    return (await res.json()) as Contribution[]
  } catch {
    return []
  }
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient()
  const authPromise = supabase.auth.getUser()
  const historyPromise = getHistory()
  const { data: authData } = await authPromise
  const history: Contribution[] = await historyPromise
  const user = authData.user

  const displayName = typeof user?.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name
    : user?.email?.split('@')[0]

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
            <span>{user?.email ?? '—'}</span>
          </div>
        </div>
      </div>

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
