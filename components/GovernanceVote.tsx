'use client'

import { useEffect, useState } from 'react'
import type { Proposal, VoteChoice } from '@/types'

interface GovernanceVoteProps {
  poolId: string
}

export default function GovernanceVote({ poolId }: GovernanceVoteProps) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [voting, setVoting] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/governance/proposals/${poolId}`)
      .then((r) => r.json())
      .then((data: Proposal[]) => setProposals(data))
      .catch(() => {})
  }, [poolId])

  async function castVote(proposalId: string, vote: VoteChoice) {
    setVoting(proposalId)
    try {
      await fetch('/api/governance/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, pool_id: poolId, vote }),
      })
      // Refresh
      const res = await fetch(`/api/governance/proposals/${poolId}`)
      setProposals(await res.json())
    } finally {
      setVoting(null)
    }
  }

  const STATUS_COLOR: Record<string, string> = {
    open: 'text-green-400',
    passed: 'text-cyan-400',
    rejected: 'text-red-400',
    expired: 'text-white/30',
  }

  return (
    <div className="space-y-4">
      {proposals.length === 0 && (
        <div className="text-center py-12 text-white/30">No proposals yet.</div>
      )}

      {proposals.map((p) => (
        <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold">{p.title}</h3>
              <p className="text-sm text-white/50 mt-1">{p.description}</p>
            </div>
            <span className={`text-sm font-medium capitalize ${STATUS_COLOR[p.status] ?? 'text-white/40'}`}>
              {p.status}
            </span>
          </div>

          <div className="text-xs text-white/30 mb-4">
            Change: <span className="text-white/50">{p.change_type}</span> → <code>{p.new_value}</code>
            <span className="ml-4">Voting ends: {new Date(p.voting_ends_at).toLocaleDateString()}</span>
          </div>

          {p.status === 'open' && (
            <div className="flex gap-3">
              {(['yes', 'no', 'abstain'] as VoteChoice[]).map((choice) => (
                <button
                  key={choice}
                  onClick={() => castVote(p.id, choice)}
                  disabled={voting === p.id}
                  className={`px-4 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-50 capitalize ${
                    choice === 'yes'
                      ? 'border-green-500/40 text-green-400 hover:bg-green-500/10'
                      : choice === 'no'
                      ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                      : 'border-white/20 text-white/50 hover:bg-white/5'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
