import GlobeScene from '@/components/GlobeScene'
import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* 3D Globe background */}
      <div className="absolute inset-0 z-0">
        <GlobeScene />
      </div>

      {/* Hero content */}
      <div className="relative z-10 text-center px-6 max-w-3xl">
        <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">
          <span className="text-white">Safe</span>
          <span className="text-green-400">Pool</span>
        </h1>
        <p className="text-xl md:text-2xl text-white/70 mb-3">
          Community-powered emergency funds.
        </p>
        <p className="text-base text-white/50 mb-10 max-w-xl mx-auto">
          Pool micro-contributions with your community. When disaster strikes,
          Interledger sends payouts instantly to every affected member.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/pools"
            className="px-8 py-3 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg transition-colors"
          >
            Browse Pools
          </Link>
          <Link
            href="/pools/create"
            className="px-8 py-3 border border-white/20 hover:border-white/40 text-white rounded-lg transition-colors"
          >
            Create a Pool
          </Link>
        </div>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-green-400">$0</div>
            <div className="text-sm text-white/40 mt-1">Total pooled</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-cyan-400">0</div>
            <div className="text-sm text-white/40 mt-1">Active pools</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-amber-400">~2s</div>
            <div className="text-sm text-white/40 mt-1">Avg payout time</div>
          </div>
        </div>
      </div>
    </div>
  )
}
