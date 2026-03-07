import Link from 'next/link'
import GlobeScene from '@/components/GlobeScene'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[#050508] overflow-hidden">
      {/* Globe — full viewport background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <GlobeScene />
      </div>

      {/* Dark overlay gradient so text is readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050508]/60 via-transparent to-[#050508]" />

      {/* Hero content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4">
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-1.5 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            HACKOMANIA 2026 · Interledger + ClickHouse
          </span>
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4 leading-none">
          <span className="text-white">Safe</span>
          <span className="text-green-400">Pool</span>
        </h1>

        <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mb-3 font-light">
          One global emergency fund that pays out automatically when disaster strikes.
        </p>

        <p className="text-gray-500 max-w-xl mb-10 text-sm">
          Pool micro-contributions with people worldwide → disaster detected by USGS/GDACS → Interledger sends payments instantly to every affected member.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/contribute"
            className="bg-green-500 hover:bg-green-400 text-black font-bold px-8 py-3 rounded-lg text-lg transition-colors"
          >
            Contribute Now
          </Link>
          <Link
            href="/pool"
            className="border border-white/20 hover:border-green-500/50 text-white hover:text-green-400 font-semibold px-8 py-3 rounded-lg text-lg transition-colors bg-white/5"
          >
            View Pool
          </Link>
        </div>

        {/* Live stats row */}
        <div className="mt-16 flex flex-wrap gap-8 justify-center">
          {[
            { label: 'Total Contributors', value: '847' },
            { label: 'Funds Protected', value: '$24,300' },
            { label: 'Disasters Monitored', value: '12' },
            { label: 'Avg Payout Time', value: '2.3s' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-green-400">{value}</div>
              <div className="text-gray-500 text-sm">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}
