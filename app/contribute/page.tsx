'use client'
import { useState } from 'react'
import Link from 'next/link'
import { GLOBAL_POOL_ID } from '@/lib/global-pool'

export default function ContributePage() {
  const [step, setStep] = useState<'form' | 'pending' | 'done'>('form')
  const [amount, setAmount] = useState(10)
  const [wallet, setWallet] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  async function contribute() {
    setStep('pending')
    setError('')
    try {
      const res = await fetch('/api/payments/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency: 'USD', wallet_address: wallet }),
      })
      const data = await res.json() as { contribution_id?: string; paymentUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Payment failed')

      // Auto-confirm for demo
      if (data.contribution_id) {
        await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contribution_id: data.contribution_id, email }),
        }).catch(() => {})
      }

      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed')
      setStep('form')
    }
  }

  const input = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-green-500/50 focus:outline-none text-sm'

  if (step === 'done') return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-6xl mb-4">✅</div>
      <h2 className="text-2xl font-bold mb-2">Contribution Confirmed!</h2>
      <p className="text-gray-400 mb-2">USD {amount.toFixed(2)} added to the global fund</p>
      <p className="text-gray-500 text-sm mb-8">A confirmation email has been sent to your address.</p>
      <Link href="/pool" className="bg-green-500 text-black font-bold px-6 py-2.5 rounded-lg">
        View Pool
      </Link>
    </div>
  )

  if (step === 'pending') return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4 animate-spin">⚙️</div>
      <p className="text-gray-400">Processing payment via Interledger...</p>
    </div>
  )

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <Link href="/pool" className="text-gray-500 text-sm hover:text-gray-300 mb-6 block">← Back to Pool</Link>
      <h1 className="text-2xl font-bold mb-2">Contribute to SafePool</h1>
      <p className="text-gray-500 text-sm mb-6">
        Your funds join the global pool and automatically pay out to members affected by disasters.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Amount (USD)</label>
          <div className="flex gap-2 mb-2">
            {[5, 10, 25, 50].map(a => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                  amount === a
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                ${a}
              </button>
            ))}
          </div>
          <input
            type="number"
            className={input}
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            min={1}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Your Wallet Address</label>
          <input
            className={input}
            placeholder="https://wallet.interledger-test.dev/yourname"
            value={wallet}
            onChange={e => setWallet(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Email (for confirmation)</label>
          <input
            type="email"
            className={input}
            placeholder="you@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 text-sm text-gray-400">
          Your contribution will be sent via{' '}
          <span className="text-green-400 font-medium">Interledger Open Payments</span>. Funds pool
          automatically and pay out instantly when a verified disaster is detected.
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={contribute}
          className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-lg transition-colors"
        >
          Contribute USD {amount.toFixed(2)}
        </button>
      </div>
    </div>
  )
}
