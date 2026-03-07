'use client'
import { useEffect, useRef, useState } from 'react'

// ── Mock data (frontend only) ─────────────────────────────────────────────────
const EQ_LOCATION      = 'Acre, Brazil'
const EQ_MAGNITUDE     = 7.4
const POOL_BALANCE     = 12_450
const USER_CONTRIBUTED = 150
const TOTAL_CONTRIB    = 3_000
const AFFECTED         = 283
const SEVERITY_MULT    = 1.0   // M7.4 → critical

const TOTAL_PAYOUT   = POOL_BALANCE * SEVERITY_MULT
const USER_SHARE     = (USER_CONTRIBUTED / TOTAL_CONTRIB) * TOTAL_PAYOUT
const PER_MEMBER     = TOTAL_PAYOUT / AFFECTED

const WALLET_SUFFIXES = ['a3f2', 'c91b', '77de', 'f043', '22ac', 'b1e8', '5d70', '9cc4']

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Phase types ───────────────────────────────────────────────────────────────
type Phase = 'idle' | 'alert' | 'payout' | 'shrinking' | 'thankyou'

// ── Sub-components ────────────────────────────────────────────────────────────

function AlertPhase() {
  const [barW, setBarW] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setBarW(100), 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
        @keyframes warning-flash {
          0%, 100% {
            background-color: rgba(0, 0, 0, 0.96);
            border-color: rgba(74, 222, 128, 0.85);
            box-shadow: 0 0 60px rgba(34,197,94,0.45), 0 0 120px rgba(34,197,94,0.12), inset 0 0 40px rgba(34,197,94,0.04);
          }
          50% {
            background-color: rgba(20, 40, 20, 0.97);
            border-color: rgba(134, 239, 172, 1);
            box-shadow: 0 0 110px rgba(34,197,94,0.75), 0 0 200px rgba(34,197,94,0.2), inset 0 0 70px rgba(34,197,94,0.09);
          }
        }
        @keyframes warning-text-flash {
          0%, 40%, 60%, 100% { color: #4ade80; text-shadow: 0 0 24px rgba(74,222,128,0.9); }
          50%                 { color: #ffffff; text-shadow: 0 0 50px rgba(134,239,172,1);  }
        }
        @keyframes scan-line {
          from { transform: translateX(-100%); }
          to   { transform: translateX(500%);  }
        }
        @keyframes corner-blink {
          0%, 49%  { opacity: 1; }
          50%, 100% { opacity: 0.1; }
        }
      `}</style>

      <div className="pointer-events-auto w-full max-w-4xl px-6 animate-in fade-in zoom-in-95 duration-200">
        <div
          className="relative overflow-hidden rounded-xl border-2 backdrop-blur-md"
          style={{ animation: 'warning-flash 0.9s ease-in-out infinite' }}
        >
          {/* Scanning green line top */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
            <div
              className="h-full w-1/4 bg-gradient-to-r from-transparent via-green-400 to-transparent"
              style={{ animation: 'scan-line 1.4s linear infinite' }}
            />
          </div>
          {/* Scanning green line bottom */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
            <div
              className="h-full w-1/4 bg-gradient-to-r from-transparent via-green-400 to-transparent"
              style={{ animation: 'scan-line 1.4s linear infinite reverse' }}
            />
          </div>

          {/* Corner accents */}
          <div className="pointer-events-none absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-green-400" style={{ animation: 'corner-blink 0.9s ease-in-out infinite' }} />
          <div className="pointer-events-none absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-green-400" style={{ animation: 'corner-blink 0.9s ease-in-out infinite 0.45s' }} />
          <div className="pointer-events-none absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-green-400" style={{ animation: 'corner-blink 0.9s ease-in-out infinite 0.45s' }} />
          <div className="pointer-events-none absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-green-400" style={{ animation: 'corner-blink 0.9s ease-in-out infinite' }} />

          {/* Main content — horizontal layout */}
          <div className="flex items-center gap-0">

            {/* Left: WARNING block */}
            <div className="flex flex-col items-center justify-center border-r border-green-500/30 px-8 py-8 shrink-0">
              <div
                className="text-[11px] font-black tracking-[0.3em] uppercase"
                style={{ animation: 'warning-text-flash 0.9s ease-in-out infinite', writingMode: 'horizontal-tb' }}
              >
                ⚠ WARNING
              </div>
              <div
                className="mt-1 text-[11px] font-black tracking-[0.3em] uppercase"
                style={{ animation: 'warning-text-flash 0.9s ease-in-out infinite 0.45s' }}
              >
                WARNING ⚠
              </div>
            </div>

            {/* Center: magnitude + label */}
            <div className="flex-1 px-8 py-8 text-center">
              <div
                className="text-[5.5rem] font-black leading-none tracking-tight"
                style={{ animation: 'warning-text-flash 0.9s ease-in-out infinite' }}
              >
                M{EQ_MAGNITUDE}
              </div>
              <div className="mt-1 text-xl font-black tracking-[0.2em] uppercase text-white/90">
                Earthquake
              </div>
            </div>

            {/* Right divider: location */}
            <div className="flex flex-col items-center justify-center border-l border-green-500/30 px-8 py-8 shrink-0 text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-green-400/60 mb-1">Epicentre</div>
              <div className="text-base font-bold text-white">{EQ_LOCATION}</div>
            </div>

          </div>

          {/* Progress bar — full width, flush to bottom */}
          <div className="h-1 w-full overflow-hidden bg-white/10">
            <div
              className="h-full bg-green-500 transition-all ease-linear"
              style={{ width: `${barW}%`, transitionDuration: '3100ms' }}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function PayoutPhase({ isShrinking }: { isShrinking: boolean }) {
  const [count, setCount] = useState(0)
  const [barW, setBarW] = useState(0)

  useEffect(() => {
    if (isShrinking) return
    const duration = 4000
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = p < 1 ? 1 - Math.pow(1 - p, 2) : 1
      setCount(Math.round(eased * AFFECTED))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const t = window.setTimeout(() => setBarW(100), 60)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [isShrinking])

  return (
    <>
      <style>{`
        @keyframes fly-up {
          0%   { transform: translateY(0);      opacity: 1; }
          12%  { transform: translateY(-16px);  opacity: 1; }
          100% { transform: translateY(-115vh); opacity: 0; }
        }
      `}</style>

      <div
        className="pointer-events-auto w-full max-w-4xl px-6 animate-in fade-in zoom-in-95 duration-200"
        style={isShrinking ? { animation: 'fly-up 0.9s cubic-bezier(0.4,0,0.2,1) forwards' } : undefined}
      >
        <div
          className="relative overflow-hidden rounded-xl border border-amber-500/50 backdrop-blur-md"
          style={{ boxShadow: '0 0 60px rgba(245,158,11,0.3), 0 0 120px rgba(245,158,11,0.08)' }}
        >
          <div className="flex items-stretch gap-0" style={{ background: 'rgba(0,0,0,0.94)' }}>

            {/* Left label */}
            <div className="flex flex-col items-center justify-center border-r border-amber-500/20 px-8 py-8 shrink-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400/70">Emergency</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-400/70 mt-0.5">Payout</div>
            </div>

            {/* Centre: count-up */}
            <div className="flex-1 flex flex-col items-center justify-center py-8 px-6 text-center">
              <div
                className="font-black leading-none tabular-nums"
                style={{
                  fontSize: '7rem',
                  color: count === AFFECTED ? '#fbbf24' : '#ffffff',
                  textShadow: count === AFFECTED
                    ? '0 0 40px rgba(251,191,36,0.8)'
                    : '0 0 20px rgba(255,255,255,0.3)',
                  transition: 'color 0.4s, text-shadow 0.4s',
                }}
              >
                {count}
              </div>
              <div className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-white/40">
                donors involved in this payout
              </div>
            </div>

            {/* Right: amount */}
            <div className="flex flex-col items-center justify-center border-l border-amber-500/20 px-8 py-8 shrink-0 text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400/60 mb-1">Dispatched</div>
              <div className="text-base font-bold text-white">${fmt(TOTAL_PAYOUT)}</div>
            </div>

          </div>

          {/* Progress bar flush to bottom */}
          <div className="h-1 w-full overflow-hidden bg-white/10">
            <div
              className="h-full bg-amber-500 transition-all ease-linear"
              style={{ width: `${barW}%`, transitionDuration: '4900ms' }}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function ThankyouPhase({ onDismiss }: { onDismiss: () => void }) {
  const [count, setCount] = useState(0)
  const [pulseRing, setPulseRing] = useState(false)

  useEffect(() => {
    // Count-up animation
    const duration = 1800
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setCount(eased * USER_SHARE)
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // Pulse ring on mount
    const t = window.setTimeout(() => setPulseRing(true), 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
        @keyframes ring-expand {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0;   }
        }
      `}</style>

      <div className="pointer-events-auto mx-4 w-full max-w-lg animate-in fade-in zoom-in-95 duration-500">
        <div
          className="relative overflow-hidden rounded-2xl border border-green-500/50 bg-black/92 p-8 text-center backdrop-blur"
          style={{ boxShadow: '0 0 90px rgba(34,197,94,0.45), 0 0 180px rgba(34,197,94,0.1)' }}
        >
          {/* Radial glow bg */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.09)_0%,transparent_65%)]" />

          {/* Expanding ring */}
          {pulseRing && (
            <div
              className="pointer-events-none absolute inset-0 m-auto h-32 w-32 rounded-full border-2 border-green-400"
              style={{ animation: 'ring-expand 1.2s ease-out forwards' }}
            />
          )}

          <div className="relative z-10">
            <div className="mb-4 text-6xl select-none">💚</div>

            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-green-400">
              Community Responded
            </div>
            <div className="mb-2 text-4xl font-black text-white">Thank You</div>
            <div className="mb-6 text-sm text-white/55">
              Your contribution made this emergency relief possible.
            </div>

            {/* Impact card */}
            <div
              className="mb-6 rounded-xl border border-green-500/30 bg-green-500/8 p-5"
              style={{ background: 'rgba(34,197,94,0.06)' }}
            >
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                Your Impact
              </div>
              <div className="text-5xl font-black text-green-400 tabular-nums">
                ${fmt(count)}
              </div>
              <div className="mt-1 text-xs text-white/45">
                funded from your ${USER_CONTRIBUTED.toLocaleString()} contribution
              </div>
            </div>

            {/* Stats row */}
            <div className="mb-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-lg font-bold text-white">{AFFECTED}</div>
                <div className="text-[10px] text-white/45 uppercase tracking-wider">Families</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-lg font-bold text-white">${(TOTAL_PAYOUT / 1000).toFixed(1)}k</div>
                <div className="text-[10px] text-white/45 uppercase tracking-wider">Dispatched</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-lg font-bold text-white">~2s</div>
                <div className="text-[10px] text-white/45 uppercase tracking-wider">Latency</div>
              </div>
            </div>

            <div className="mb-5 text-xs text-white/40">
              {EQ_LOCATION} · M{EQ_MAGNITUDE} · severity_based distribution · ILP Open Payments
            </div>

            <button
              className="rounded-lg border border-white/20 bg-white/5 px-7 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              onClick={onDismiss}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export default function EarthquakeDemoOverlay() {
  const [phase, setPhase] = useState<Phase>('idle')
  const timersRef = useRef<number[]>([])

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const dismiss = () => {
    clearTimers()
    setPhase('idle')
    window.dispatchEvent(new CustomEvent('safepool:earthquake-end'))
  }

  useEffect(() => {
    const handle = () => {
      clearTimers()
      setPhase('alert')

      const t1 = window.setTimeout(() => setPhase('payout'),    5000)
      const t2 = window.setTimeout(() => {
        setPhase('shrinking')
        window.dispatchEvent(new CustomEvent('safepool:earthquake-resolved'))
      }, 10000)
      const t3 = window.setTimeout(() => setPhase('thankyou'), 15000)
      const t4 = window.setTimeout(() => {
        setPhase('idle')
        window.dispatchEvent(new CustomEvent('safepool:earthquake-end'))
      }, 23000)
      timersRef.current = [t1, t2, t3, t4]
    }

    window.addEventListener('safepool:earthquake-demo', handle)
    return () => {
      window.removeEventListener('safepool:earthquake-demo', handle)
      clearTimers()
    }
  }, [])

  if (phase === 'idle') return null

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      {phase === 'alert'                          && <AlertPhase />}
      {(phase === 'payout' || phase === 'shrinking') && <PayoutPhase isShrinking={phase === 'shrinking'} />}
      {phase === 'thankyou'                       && <ThankyouPhase onDismiss={dismiss} />}
    </div>
  )
}
