'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function GovernancePage() {
  const params = useParams()
  const poolId = params.id as string
  const [proposals, setProposals] = useState<any[]>([])
  const [form, setForm] = useState({ title: '', description: '', change_type: 'trigger_rules', new_value: '' })
  const [loading, setLoading] = useState(false)

  const loadProposals = () =>
    fetch(`/api/governance/proposals/${poolId}`)
      .then(r => r.json())
      .then(setProposals)
      .catch(() => {})

  useEffect(() => { loadProposals() }, [poolId])

  async function propose() {
    setLoading(true)
    await fetch('/api/governance/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, pool_id: poolId, proposed_by: 'guest' }),
    })
    setForm({ title: '', description: '', change_type: 'trigger_rules', new_value: '' })
    await loadProposals()
    setLoading(false)
  }

  async function castVote(proposalId: string, vote: string) {
    await fetch('/api/governance/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposalId, pool_id: poolId, member_id: 'guest', vote }),
    })
    await loadProposals()
  }

  const input = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500/50 focus:outline-none text-sm'

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href={`/pools/${poolId}`} className="text-gray-500 text-sm hover:text-gray-300 mb-6 block">← Back to Pool</Link>
      <h1 className="text-2xl font-bold mb-6">Governance</h1>

      {/* New proposal form */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-8">
        <h2 className="font-semibold mb-4">New Proposal</h2>
        <div className="space-y-3">
          <input
            className={input}
            placeholder="Title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className={`${input} h-20 resize-none`}
            placeholder="Describe the change..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              className={input}
              value={form.change_type}
              onChange={e => setForm(f => ({ ...f, change_type: e.target.value }))}
            >
              <option value="trigger_rules">Trigger Rules</option>
              <option value="distribution_model">Distribution Model</option>
              <option value="payout_cap">Payout Cap</option>
              <option value="contribution_amount">Contribution Amount</option>
            </select>
            <input
              className={input}
              placeholder="New value (JSON or number)"
              value={form.new_value}
              onChange={e => setForm(f => ({ ...f, new_value: e.target.value }))}
            />
          </div>
          <button
            onClick={propose}
            disabled={loading || !form.title}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Submitting...' : 'Submit Proposal'}
          </button>
        </div>
      </div>

      {/* Proposal list */}
      <div className="space-y-4">
        {proposals.map((p: any) => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold">{p.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                p.status === 'open'     ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                p.status === 'passed'   ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                                          'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>{p.status}</span>
            </div>
            <p className="text-gray-400 text-sm mb-1">{p.description}</p>
            <p className="text-gray-600 text-xs mb-3">
              Change: <span className="text-gray-400">{p.change_type}</span> → <code className="text-gray-300">{p.new_value}</code>
            </p>
            {p.status === 'open' && (
              <div className="flex gap-2">
                {['yes', 'no', 'abstain'].map(v => (
                  <button
                    key={v}
                    onClick={() => castVote(p.id, v)}
                    className="px-3 py-1 rounded text-xs border border-white/10 hover:border-white/30 text-gray-400 hover:text-white transition-colors capitalize"
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {proposals.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">No proposals yet.</div>
        )}
      </div>
    </div>
  )
}
