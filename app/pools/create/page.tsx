'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DistributionModel, ContributionFrequency, DisasterType, CreatePoolRequest } from '@/types'

const DISASTER_TYPES: DisasterType[] = ['earthquake', 'flood', 'typhoon', 'cyclone', 'volcanic', 'tsunami', 'fire']

export default function CreatePoolPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    description: '',
    distribution_model: 'equal_split' as DistributionModel,
    contribution_frequency: 'monthly' as ContributionFrequency,
    contribution_amount: 10,
    currency: 'USD',
    payout_cap: 500,
    minMagnitude: 6.0,
    radius_km: 50,
    disasterTypes: ['earthquake', 'flood'] as DisasterType[],
    quorum_pct: 50,
    vote_threshold: 60,
  })

  function toggleDisasterType(type: DisasterType) {
    setForm((f) => ({
      ...f,
      disasterTypes: f.disasterTypes.includes(type)
        ? f.disasterTypes.filter((t) => t !== type)
        : [...f.disasterTypes, type],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const body: CreatePoolRequest = {
      name: form.name,
      description: form.description,
      distribution_model: form.distribution_model,
      contribution_frequency: form.contribution_frequency,
      contribution_amount: form.contribution_amount,
      currency: form.currency,
      payout_cap: form.payout_cap,
      trigger_rules: {
        minMagnitude: form.minMagnitude,
        disasterTypes: form.disasterTypes,
        radius_km: form.radius_km,
      },
      governance_rules: {
        quorum_pct: form.quorum_pct,
        vote_threshold: form.vote_threshold,
      },
    }

    try {
      const res = await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }
      const pool = await res.json() as { id: string }
      router.push(`/pools/${pool.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create pool')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-green-500/60 transition-colors'
  const labelClass = 'block text-sm text-white/60 mb-1.5'

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Create a Pool</h1>
      <p className="text-white/50 mb-8">Set up a community emergency fund with automated ILP payouts.</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-lg">Basic Info</h2>
          <div>
            <label className={labelClass}>Pool Name</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Manila Flood Relief" />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={inputClass} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="What does this pool cover?" />
          </div>
        </section>

        {/* Contributions */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-lg">Contributions</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Amount</label>
              <input type="number" className={inputClass} value={form.contribution_amount} onChange={(e) => setForm({ ...form, contribution_amount: Number(e.target.value) })} min={1} required />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="USD" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Frequency</label>
            <select className={inputClass} value={form.contribution_frequency} onChange={(e) => setForm({ ...form, contribution_frequency: e.target.value as ContributionFrequency })}>
              {['daily', 'weekly', 'monthly', 'event_based'].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Distribution Model</label>
            <select className={inputClass} value={form.distribution_model} onChange={(e) => setForm({ ...form, distribution_model: e.target.value as DistributionModel })}>
              {['equal_split', 'severity_based', 'household_size', 'capped'].map((m) => (
                <option key={m} value={m}>{m.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Payout Cap (per member, USD)</label>
            <input type="number" className={inputClass} value={form.payout_cap} onChange={(e) => setForm({ ...form, payout_cap: Number(e.target.value) })} min={0} />
          </div>
        </section>

        {/* Trigger rules */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-lg">Trigger Rules</h2>
          <div>
            <label className={labelClass}>Disaster Types</label>
            <div className="flex flex-wrap gap-2">
              {DISASTER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleDisasterType(type)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    form.disasterTypes.includes(type)
                      ? 'bg-green-500/20 border-green-500/60 text-green-300'
                      : 'border-white/10 text-white/40 hover:border-white/30'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Min Magnitude</label>
              <input type="number" step="0.1" className={inputClass} value={form.minMagnitude} onChange={(e) => setForm({ ...form, minMagnitude: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelClass}>Radius (km)</label>
              <input type="number" className={inputClass} value={form.radius_km} onChange={(e) => setForm({ ...form, radius_km: Number(e.target.value) })} />
            </div>
          </div>
        </section>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold rounded-lg transition-colors"
        >
          {loading ? 'Creating…' : 'Create Pool'}
        </button>
      </form>
    </div>
  )
}
