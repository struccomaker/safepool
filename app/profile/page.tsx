// Server Component — user wallet + contribution history
import { getServerSession } from 'next-auth'
import type { Contribution } from '@/types'

async function getHistory(): Promise<Contribution[]> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/payments/history/all`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Failed')
    return res.json()
  } catch {
    return []
  }
}

export default async function ProfilePage() {
  const [session, history] = await Promise.all([getServerSession(), getHistory()])

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-8">Profile</h1>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/40">Name</span>
            <span>{session?.user?.name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Email</span>
            <span>{session?.user?.email ?? '—'}</span>
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
