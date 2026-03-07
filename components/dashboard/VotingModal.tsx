'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '../ui/button'

interface Proposal {
  id:       string
  question: string
  status:   string
}

interface VotingModalProps {
  open:    boolean
  onClose: () => void
}

type DemoPhase =
  | 'idle'
  | 'seeding'      // inserting new votes
  | 'countdown'    // 30s countdown before resolve
  | 'resolving'    // calling resolve endpoint
  | 'done'         // resolved

const COUNTDOWN_SEC = 30

export default function VotingModal({ open, onClose }: VotingModalProps) {
  const [proposals, setProposals]   = useState<Proposal[]>([])
  const [myVotes, setMyVotes]       = useState<Record<string, string>>({})
  const [submitted, setSubmitted]   = useState(false)
  const [demoPhase, setDemoPhase]   = useState<DemoPhase>('idle')
  const [countdown, setCountdown]   = useState(COUNTDOWN_SEC)
  const [demoMsg, setDemoMsg]       = useState<string | null>(null)
  const countdownRef                = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Fetch proposals on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    fetch('/api/governance/propose')
      .then(r => r.json())
      .then(data => setProposals(data.proposals ?? []))
      .catch(() => {})
  }, [open])

  // ─── Demo sequence ────────────────────────────────────────────────────────
  const runDemoSequence = useCallback(async () => {
    if (demoPhase !== 'idle') return   // prevent double-trigger

    try {
      // Phase 1 — Seed new votes
      setDemoPhase('seeding')
      setDemoMsg('Seeding new community votes...')
      const seedRes = await fetch('/api/governance/seed-round', { method: 'POST' })
      const seedData = await seedRes.json()
      if (!seedRes.ok) throw new Error(seedData.error)
      setDemoMsg(`✓ ${seedData.votes} votes inserted across ${seedData.proposals} proposals. Resolving in ${COUNTDOWN_SEC}s...`)

      // Phase 2 — 30 second countdown
      setDemoPhase('countdown')
      setCountdown(COUNTDOWN_SEC)
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          const next = prev - 1
          setDemoMsg(`✓ Votes seeded. Resolving in ${next}s...`)
          if (next <= 0) {
            clearInterval(countdownRef.current!)
          }
          return next
        })
      }, 1000)

      await new Promise(r => setTimeout(r, COUNTDOWN_SEC * 1000))

      // Phase 3 — Resolve
      setDemoPhase('resolving')
      setDemoMsg('Resolving voting round...')
      const resolveRes = await fetch('/api/governance/resolve', { method: 'POST' })
      const resolveData = await resolveRes.json()
      if (!resolveRes.ok) throw new Error(resolveData.error)

      const passed = resolveData.resolved?.filter(
        (p: { proposal_passed: number }) => p.proposal_passed === 1
      ).length ?? 0

      setDemoPhase('done')
      setDemoMsg(`✓ Round resolved — ${passed} proposal${passed !== 1 ? 's' : ''} passed. Parameters updated.`)

      // Refresh proposals list to show updated statuses
      const refreshed = await fetch('/api/governance/propose').then(r => r.json())
      setProposals(refreshed.proposals ?? [])

    } catch (err) {
      setDemoPhase('idle')
      setDemoMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [demoPhase])

  // ─── Keyboard listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === '3') {
        runDemoSequence()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, runDemoSequence])

  // ─── Cleanup countdown on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // ─── Reset demo state when modal closes ───────────────────────────────────
  useEffect(() => {
    if (!open) {
      setDemoPhase('idle')
      setDemoMsg(null)
      setCountdown(COUNTDOWN_SEC)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [open])

  if (!open) return null

  const isRunning = demoPhase !== 'idle' && demoPhase !== 'done'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d0d14] text-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight">Community Voting</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto max-h-[75vh] px-6 py-5 space-y-6">

          {/* Demo keyboard hint */}
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <kbd className="rounded border border-white/20 bg-white/10 px-2 py-1 text-xs font-mono text-white/70">3</kbd>
            <span className="text-xs text-white/50">
              Demo shortcut — seeds new votes and resolves after {COUNTDOWN_SEC}s
            </span>
          </div>

          {/* Demo status bar */}
          {demoMsg && (
            <div className={`rounded-lg border px-4 py-3 text-sm transition-all ${
              demoPhase === 'done'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : demoPhase === 'idle' && demoMsg.startsWith('Error')
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : 'border-white/10 bg-white/5 text-white/60'
            }`}>
              {isRunning && (
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
              )}
              {demoMsg}
            </div>
          )}

          {/* Countdown ring — visible during countdown phase */}
          {demoPhase === 'countdown' && (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="relative h-16 w-16">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke="#10b981" strokeWidth="2"
                    strokeDasharray={`${(countdown / COUNTDOWN_SEC) * 100} 100`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-white">
                  {countdown}
                </span>
              </div>
              <p className="text-xs text-white/40">seconds until resolution</p>
            </div>
          )}

          {/* Vote weight explainer */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 text-sm">
            <div>
              <p className="font-medium text-white/90">Your vote weight</p>
              <p className="text-white/50 leading-relaxed mt-1">
                Every $1 you have ever contributed to the pool counts as 1 vote.
                The more you have put in over time, the more influence you have on
                how the pool is governed.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/90">What you can vote on</p>
              <p className="text-white/50 leading-relaxed mt-1">
                Proposals are put forward by members to change the pool's three core
                parameters — Safety Cap, Trigger Sensitivity, and Impact Radius.
                Each proposal is a yes/no question.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/90">When a proposal passes</p>
              <p className="text-white/50 leading-relaxed mt-1">
                A proposal passes when quorum is met and the majority votes yes.
                Once passed, the parameter change takes effect on the next disaster check cycle.
              </p>
            </div>
            <div>
              <p className="font-medium text-white/90">Abstaining</p>
              <p className="text-white/50 leading-relaxed mt-1">
                Choosing to abstain registers your participation without casting a yes or no.
                This can be used strategically — abstaining on a proposal you oppose prevents
                quorum from being reached.
              </p>
            </div>
          </div>

          {/* Proposals list */}
          {proposals.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-widest text-white/30">Open Proposals</p>
              {proposals.map(p => {
                const myVote = myVotes[p.id]
                return (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-white/80">{p.question}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        p.status === 'passed'   ? 'bg-emerald-500/20 text-emerald-400' :
                        p.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-white/10 text-white/40'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    {myVote ? (
                      <p className="text-xs text-white/40">You voted <span className="text-white/70 font-medium">{myVote}</span></p>
                    ) : p.status === 'open' ? (
                      <div className="flex gap-2">
                        {['yes', 'no', 'abstain'].map(option => (
                          <button
                            key={option}
                            onClick={() => setMyVotes(v => ({ ...v, [p.id]: option }))}
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/15 hover:text-white transition-colors capitalize"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {/* New proposal form */}
          <div className="space-y-3 border-t border-white/10 pt-4">
            <p className="text-xs font-medium uppercase tracking-widest text-white/30">New Proposal</p>
            {submitted ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                Proposal submitted!
              </p>
            ) : (
              <Button
                className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10"
                variant="ghost"
                onClick={() => setSubmitted(true)}
              >
                Submit Proposal
              </Button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
