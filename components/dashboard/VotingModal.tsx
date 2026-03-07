'use client'

import { useState, type FormEvent, useEffect, useCallback, useRef } from 'react'

interface VotingModalProps {
  open: boolean
  onClose: () => void
}

interface Proposal {
  id: number
  question: string
  status: 'open' | 'passed' | 'rejected'
  yes: number
  no: number
}

const PROPOSAL_TYPES = [
  { value: 'raise_cap', label: 'Raise Safety Cap' },
  { value: 'lower_magnitude', label: 'Lower Trigger Sensitivity' },
  { value: 'expand_radius', label: 'Expand Coverage Radius' },
  { value: 'other', label: 'Other' },
]

const statusBadge: Record<Proposal['status'], string> = {
  open: 'bg-green-500/20 text-green-400 border border-green-500/30',
  passed: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  rejected: 'bg-red-500/20 text-red-400 border border-red-500/30',
}

const INITIAL_PROPOSALS: Proposal[] = [
  {
    id: 1,
    question: 'Should we increase the Safety Cap from 10% to 15%?',
    status: 'open',
    yes: 280,
    no: 62,
  },
  {
    id: 2,
    question: 'Should we lower the Trigger Sensitivity from 6.0 to 5.5?',
    status: 'open',
    yes: 89,
    no: 45,
  },
  {
    id: 3,
    question: 'Should we expand the Impact Radius from 50 km to 75 km?',
    status: 'passed',
    yes: 410,
    no: 120,
  },
]

function VoteBar({ yes, no }: { yes: number; no: number }) {
  const total = yes + no
  const yesPct = total === 0 ? 50 : Math.round((yes / total) * 100)
  const noPct = 100 - yesPct

  return (
    <div className="mt-4">
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        <div className="bg-green-500/70 transition-all" style={{ width: `${yesPct}%` }} />
        <div className="bg-red-500/70 transition-all" style={{ width: `${noPct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-green-400">Yes {yesPct}%</span>
        <span className="text-red-400">No {noPct}%</span>
      </div>
    </div>
  )
}

function VotingInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-white/20 bg-black/85 p-7 text-white shadow-2xl">
        <button
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>

        <h2 className="mb-6 text-lg font-semibold">How Voting Works</h2>

        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">Your vote weight</p>
            <p className="text-sm leading-relaxed text-white/60">
              Every $1 you have ever contributed to the pool counts as 1 vote. The more you have put in over time,
              the more influence you have on how the pool is governed.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">What you can vote on</p>
            <p className="text-sm leading-relaxed text-white/60">
              Proposals are put forward by members to change the pool's three core parameters — Safety Cap, Trigger
              Sensitivity, and Impact Radius. Each proposal is a yes/no question.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">When a proposal passes</p>
            <p className="text-sm leading-relaxed text-white/60">
              A proposal passes when quorum is met and the majority votes yes. Once passed, the parameter change
              takes effect on the next disaster check cycle.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">Abstaining</p>
            <p className="text-sm leading-relaxed text-white/60">
              Choosing to abstain registers your participation without casting a yes or no. This can be used
              strategically — abstaining on a proposal you oppose prevents quorum from being reached.
            </p>
          </div>
        </div>

        <button
          className="mt-6 h-10 w-full rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          onClick={onClose}
          type="button"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function VotingInfo() {
  const [show, setShow] = useState(false)

  return (
    <>
      <button
        aria-label="Voting info"
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/50 transition-colors hover:border-white/50 hover:text-white"
        onClick={() => setShow(true)}
        type="button"
      >
        ?
      </button>
      {show && <VotingInfoModal onClose={() => setShow(false)} />}
    </>
  )
}

export default function VotingModal({ open, onClose }: VotingModalProps) {
  const [proposals, setProposals] = useState<Proposal[]>(INITIAL_PROPOSALS)
  const [votes, setVotes] = useState<Record<number, 'yes' | 'no' | 'abstain'>>({})
  const [showNewProposal, setShowNewProposal] = useState(false)
  const [proposalType, setProposalType] = useState('raise_cap')
  const [proposalDesc, setProposalDesc] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const COUNTDOWN_SEC = 15
  type DemoPhase = 'idle' | 'countdown' | 'seeding' | 'resolving' | 'done'

  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC)
  const [demoMsg, setDemoMsg]     = useState<string | null>(null)
  const countdownRef              = useRef<ReturnType<typeof setInterval> | null>(null)

  const demoRunningRef = useRef(false)

  const runDemoSequence = useCallback(async () => {
    if (demoRunningRef.current) return   //
    demoRunningRef.current = true

    try {
      setDemoPhase('countdown')
      setDemoMsg(`Voting round re-opened. Resolving in ${COUNTDOWN_SEC}s...`)

      await fetch('/api/governance/seed-round', {
        method: 'POST',
        headers: { 'x-phase': 'reset-only' },
      })

      setCountdown(COUNTDOWN_SEC)
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          const next = prev - 1
          setDemoMsg(`Voting round open. Resolving in ${next}s...`)
          if (next <= 0) clearInterval(countdownRef.current!)
          return next
        })
      }, 1000)

      await new Promise(r => setTimeout(r, COUNTDOWN_SEC * 1000))

      setDemoPhase('seeding')
      setDemoMsg('Seeding community votes...')
      await fetch('/api/governance/seed-round', { method: 'POST' })

      setDemoPhase('resolving')
      setDemoMsg('Resolving voting round...')
      const res  = await fetch('/api/governance/resolve', { method: 'POST' })
      const data = await res.json()
      const passed = data.resolved?.filter(
        (p: { proposal_passed: number }) => p.proposal_passed === 1
      ).length ?? 0

      setDemoPhase('done')
      setDemoMsg(`✓ Proposal${passed !== 1 ? 's' : ''} passed. ${passed} parameters updated.`)

    } catch (err) {
      setDemoMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setDemoPhase('idle')
    } finally {
      demoRunningRef.current = false   // always unlock
    }
  }, [])  

  // Keyboard listener 
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key === '3') runDemoSequence()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, runDemoSequence])


  if (!open) return null

  const handleVote = (id: number, vote: 'yes' | 'no' | 'abstain') => {
    if (votes[id]) return
    setVotes((prev) => ({ ...prev, [id]: vote }))
    if (vote === 'abstain') return
    setProposals((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, yes: vote === 'yes' ? p.yes + 1 : p.yes, no: vote === 'no' ? p.no + 1 : p.no }
          : p,
      ),
    )
  }

  const handleNewProposal = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    console.log('New proposal submitted:', { proposalType, proposalDesc })
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setShowNewProposal(false)
      setProposalDesc('')
      setProposalType('raise_cap')
    }, 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/20 bg-black/85 p-6 text-white shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <h2 className="flex items-center text-xl font-semibold">
            Voting
            <VotingInfo />
          </h2>
          <button
            className="ml-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Demo status */}
        {demoMsg && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            demoPhase === 'done'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : demoMsg.startsWith('Error')
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
          }`}>
            {demoPhase !== 'idle' && demoPhase !== 'done' && (
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
            )}
            {demoMsg}
            {/* {demoPhase === 'countdown' && (
              <span className="ml-2 font-mono font-bold">{countdown}s</span>
            )} */}
          </div>
        )}

        {/* Keyboard hint */}
        <div className="flex items-center gap-2">
          <kbd className="rounded border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-mono text-white/50">3</kbd>
          <span className="text-xs text-white/30">Re-open voting &amp; resolve after 15s</span>
        </div>

        <div className="flex flex-col gap-4">
          {proposals.map((p) => {
            const myVote = votes[p.id]
            const isOpen = p.status === 'open'
            const canVote = isOpen && !myVote

            const voteBtn = (vote: 'yes' | 'no' | 'abstain', label: string, activeClass: string, hoverBorder: string) => (
              <button
                className={`h-10 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  myVote === vote
                    ? activeClass
                    : `border-white/10 text-white/50 ${canVote ? `hover:text-white ${hoverBorder}` : 'cursor-not-allowed opacity-50'}`
                }`}
                disabled={!canVote && myVote !== vote}
                onClick={() => handleVote(p.id, vote)}
                type="button"
              >
                {label}
              </button>
            )

            return (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5" key={p.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold leading-snug text-white/50">{p.question}</p>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs capitalize ${statusBadge[p.status]}`}>
                    {p.status}
                  </span>
                </div>

                <VoteBar yes={p.yes} no={p.no} />

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {voteBtn('yes', `Yes (${p.yes})`, 'border-green-500/60 bg-green-500/20 text-green-400', 'hover:border-green-500/50')}
                  {voteBtn('no', `No (${p.no})`, 'border-red-500/60 bg-red-500/20 text-red-400', 'hover:border-red-500/50')}
                  {voteBtn('abstain', 'Abstain', 'border-white/30 bg-white/10 text-white/70', 'hover:border-white/30')}
                </div>

                {myVote && (
                  <p className="mt-3 text-center text-xs text-white/40">
                    You voted <span className="capitalize text-white/60">{myVote}</span>
                  </p>
                )}
              </div>
            )
          })}

          {/* New Proposal */}
          {!showNewProposal ? (
            <button
              className="h-10 w-full rounded-md border border-dashed border-white/20 px-4 py-2 text-sm font-medium text-white/50 transition-colors hover:border-white/40 hover:text-white/80"
              onClick={() => setShowNewProposal(true)}
              type="button"
            >
              + New Proposal
            </button>
          ) : (
            <div className="rounded-md border border-white/10 bg-white/5 p-6">
              <p className="mb-4 text-sm font-medium">New Proposal</p>
              {submitted ? (
                <p className="py-4 text-center text-sm text-green-400">Proposal submitted!</p>
              ) : (
                <form className="space-y-4" onSubmit={handleNewProposal}>
                  <div>
                    <label className="mb-1 block text-sm text-white/75" htmlFor="proposal-type">
                      Proposal Type
                    </label>
                    <select
                      className="w-full rounded-md border border-white/20 bg-black/60 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      id="proposal-type"
                      onChange={(e) => setProposalType(e.target.value)}
                      value={proposalType}
                    >
                      {PROPOSAL_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-white/75" htmlFor="proposal-desc">
                      Description
                    </label>
                    <textarea
                      className="w-full rounded-md border border-white/20 bg-black/60 px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                      id="proposal-desc"
                      onChange={(e) => setProposalDesc(e.target.value)}
                      placeholder="Describe your proposed change and rationale..."
                      required
                      rows={3}
                      value={proposalDesc}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="h-10 flex-1 rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
                      onClick={() => setShowNewProposal(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="h-10 flex-1 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
                      type="submit"
                    >
                      Submit
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
