// Server Component — pool member list
import type { Member } from '@/types'

async function getMembers(poolId: string): Promise<Member[]> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/members/${poolId}`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Failed')
    return res.json()
  } catch {
    return []
  }
}

export default async function MembersPage({ params }: { params: { id: string } }) {
  const members = await getMembers(params.id)

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Members</h1>
      <p className="text-white/50 mb-8">{members.length} active members in this pool</p>

      <div className="space-y-3">
        {members.length === 0 && (
          <div className="text-center py-12 text-white/30">No members yet.</div>
        )}
        {members.map((m) => (
          <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between">
            <div>
              <div className="font-mono text-sm text-white/70 truncate max-w-xs">{m.wallet_address}</div>
              <div className="text-xs text-white/30 mt-1">
                {m.location_lat.toFixed(4)}, {m.location_lon.toFixed(4)} · Household: {m.household_size}
              </div>
            </div>
            <div className="text-xs text-white/30">
              {new Date(m.joined_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
