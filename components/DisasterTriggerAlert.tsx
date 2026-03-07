'use client'
import { useState } from 'react'

export default function DisasterTriggerAlert({ poolId }: { poolId?: string }) {
  const [loading, setLoading] = useState(false)
  const [triggered, setTriggered] = useState(false)

  async function triggerDemo() {
    setLoading(true)
    const res = await fetch('/api/disasters/manual-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disaster_type: 'earthquake',
        magnitude: 6.5,
        severity: 'high',
        location_name: 'Metro Manila, Philippines',
        location_lat: 14.5995,
        location_lon: 120.9842,
      }),
    })
    if (res.ok) {
      setTriggered(true)
      await fetch('/api/cron/process-payouts', {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? 'changeme'}` },
      }).catch(() => {})
    }
    setLoading(false)
  }

  if (triggered) return (
    <div className="mb-6 bg-red-500/10 border border-red-500/40 rounded-xl p-5 flex items-start gap-4">
      <span className="text-3xl animate-pulse">🚨</span>
      <div>
        <div className="text-red-400 font-bold text-lg">Disaster Triggered!</div>
        <div className="text-gray-400 text-sm">M6.5 earthquake near Metro Manila. ILP payouts are being processed...</div>
      </div>
    </div>
  )

  return (
    <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="font-semibold mb-2">Demo: Simulate Disaster</h3>
      <p className="text-gray-400 text-sm mb-4">Trigger a M6.5 earthquake near Metro Manila to demonstrate the automated payout flow.</p>
      <button
        onClick={triggerDemo}
        disabled={loading}
        className="bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Triggering...' : '🚨 Simulate Earthquake M6.5'}
      </button>
    </div>
  )
}
