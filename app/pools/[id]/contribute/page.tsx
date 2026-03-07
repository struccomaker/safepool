'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

export default function ContributePage() {
  const { id: poolId } = useParams<{ id: string }>()
  const [amount, setAmount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paymentUrl, setPaymentUrl] = useState('')

  async function handleContribute(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/payments/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool_id: poolId, amount, currency: 'USD' }),
      })
      const data = await res.json() as { paymentUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create payment')

      if (data.paymentUrl) {
        setPaymentUrl(data.paymentUrl)
        // Redirect to wallet provider
        window.location.href = data.paymentUrl
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-2">Contribute</h1>
      <p className="text-white/50 mb-8">
        Your contribution goes into the pool and earns you payout rights in case of a disaster.
      </p>

      <form onSubmit={handleContribute} className="space-y-5">
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Amount (USD)</label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-500/60 transition-colors"
            required
          />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white/50">
          You will be redirected to your Interledger wallet to authorize this payment.
          After authorization, the contribution is recorded on ClickHouse and a confirmation email is sent.
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {paymentUrl && <p className="text-green-400 text-sm">Redirecting to wallet…</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold rounded-lg transition-colors"
        >
          {loading ? 'Creating payment…' : `Pay $${amount} via Interledger`}
        </button>
      </form>
    </div>
  )
}
