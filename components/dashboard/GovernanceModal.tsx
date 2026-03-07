'use client'

import { useState, useEffect } from 'react'
import type { PayoutParameters } from '@/app/api/governance/parameters/route'

interface GovernanceModalProps {
  open: boolean
  onClose: () => void
}

const PARAM_BOUNDS = {
  safety_cap:          { min: 0.05, max: 0.25 },
  trigger_sensitivity: { min: 4.5,  max: 7.5  },
  impact_radius:       { min: 20,   max: 150   },
} as const

const DEFAULTS: PayoutParameters = {
  safety_cap:          0.10,
  trigger_sensitivity: 6.0,
  impact_radius:       50.0,
}

function clampParams(raw: PayoutParameters): PayoutParameters {
  return {
    safety_cap:          Math.min(Math.max(raw.safety_cap,          PARAM_BOUNDS.safety_cap.min),          PARAM_BOUNDS.safety_cap.max),
    trigger_sensitivity: Math.min(Math.max(raw.trigger_sensitivity, PARAM_BOUNDS.trigger_sensitivity.min), PARAM_BOUNDS.trigger_sensitivity.max),
    impact_radius:       Math.min(Math.max(raw.impact_radius,       PARAM_BOUNDS.impact_radius.min),       PARAM_BOUNDS.impact_radius.max),
  }
}

function LeaderBar({ value, max, min = 0 }: { value: number; max: number; min?: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(((value - min) / (max - min)) * 100)))
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function QuorumInfoModal({ onClose }: { onClose: () => void }) {
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

        <h2 className="mb-6 text-lg font-semibold">Quorum Explained</h2>

        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">What is a quorum?</p>
            <p className="text-sm leading-relaxed text-white/60">
              A quorum is the minimum participation level required for a vote to be valid. Without it, a handful of
              members could quietly pass changes that the rest of the pool never engaged with.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">Why do we need it?</p>
            <p className="text-sm leading-relaxed text-white/60">
              To ensure fairness and prevent governance attacks.  If a "Whale" (large donor) proposes a selfish rule, the community can block it simply by abstaining, preventing the Quorum from being met.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-white">Formula</p>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-green-400">
              totalVotes ÷ poolBalance ≥ 20%
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/40">
              With a $120,000 SGD pool, at least $24,000 SGD of voting weight must participate. Every $1 of
              lifetime contributions counts as 1 vote.
            </p>
          </div>
        </div>

        <button
          className="mt-6 w-full rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          onClick={onClose}
          type="button"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function QuorumInfo() {
  const [show, setShow] = useState(false)

  return (
    <>
      <button
        aria-label="Quorum info"
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/50 transition-colors hover:border-white/50 hover:text-white"
        onClick={() => setShow(true)}
        type="button"
      >
        ?
      </button>
      {show && <QuorumInfoModal onClose={() => setShow(false)} />}
    </>
  )
}

export default function GovernanceModal({ open, onClose }: GovernanceModalProps) {
  
  const [params, setParams]             = useState<PayoutParameters>(DEFAULTS)
  const [usingDefaults, setUsingDefaults] = useState(true)
  const [loading, setLoading]           = useState(false)
  
  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/governance/parameters')
      .then(r => r.json())
      .then(data => {
        setParams(clampParams(data.parameters))
        setUsingDefaults(data.using_defaults)
      })
      .catch(() => {
        setParams(DEFAULTS)
        setUsingDefaults(true)
      })
      .finally(() => setLoading(false))
  }, [open])


  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-white/20 bg-black/85 p-5 text-white shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pool Governance</h2>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">Pool Parameters</h3>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Safety Cap</p>
                <p className="text-xs text-white/50">Max % of pool released per disaster event</p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-green-400">
                {loading ? '—' : `${(params.safety_cap * 100).toFixed(0)}%`}
              </span>
            </div>
            <LeaderBar value={params.safety_cap} min={PARAM_BOUNDS.safety_cap.min} max={PARAM_BOUNDS.safety_cap.max} />
            <div className="flex justify-between text-[10px] text-white/25">
              <span>{(PARAM_BOUNDS.safety_cap.min * 100).toFixed(0)}%</span>
              <span>{(PARAM_BOUNDS.safety_cap.max * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Trigger Sensitivity</p>
                <p className="text-xs text-white/50">Minimum earthquake magnitude to trigger payout</p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-green-400">
                {loading ? '—' : `M${params.trigger_sensitivity.toFixed(1)}`}
              </span>
            </div>
            <LeaderBar value={params.trigger_sensitivity} min={PARAM_BOUNDS.trigger_sensitivity.min} max={PARAM_BOUNDS.trigger_sensitivity.max} />
            <div className="flex justify-between text-[10px] text-white/25">
              <span>M{PARAM_BOUNDS.trigger_sensitivity.min}</span>
              <span>M{PARAM_BOUNDS.trigger_sensitivity.max}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Impact Radius</p>
                <p className="text-xs text-white/50">Coverage area around epicentre</p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-green-400">
                  {loading ? '—' : `${params.impact_radius.toFixed(0)} km`}
                </span>
            </div>
            <LeaderBar value={params.impact_radius} min={PARAM_BOUNDS.impact_radius.min} max={PARAM_BOUNDS.impact_radius.max} />
            <div className="flex justify-between text-[10px] text-white/25">
              <span>{PARAM_BOUNDS.impact_radius.min} km</span>
              <span>{PARAM_BOUNDS.impact_radius.max} km</span>
            </div>
          </div>

          {/* Pool Stats */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-white/50">Pool Stats</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-white/60">Total Lifetime Donated</span>
                <span className="font-semibold">$284,500 SGD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Current Money in Pool</span>
                <span className="font-semibold">$120,000 SGD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Total Members</span>
                <span className="font-semibold">342</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center text-white/60">
                  Quorum Threshold
                  <QuorumInfo />
                </span>
                <span className="font-semibold">20% of balance</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
