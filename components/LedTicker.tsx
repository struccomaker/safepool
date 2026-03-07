'use client'

import { useEffect, useRef, useState } from 'react'
import type { TickerEvent } from '@/types'

const MOCK_EVENTS: TickerEvent[] = [
  { type: 'contribution', label: 'Ana M. contributed to Manila Flood Relief', amount: 10, currency: 'USD', timestamp: new Date().toISOString() },
  { type: 'payout', label: 'Emergency payout sent — Manila Flood Relief', amount: 250, currency: 'USD', timestamp: new Date().toISOString() },
  { type: 'disaster', label: 'M6.5 earthquake detected — Metro Manila', timestamp: new Date().toISOString() },
]

function formatEvent(e: TickerEvent): string {
  const prefix = e.type === 'contribution' ? '+' : e.type === 'payout' ? 'PAYOUT' : '!'
  const amount = e.amount ? ` $${e.amount} ${e.currency}` : ''
  return `${prefix} ${e.label}${amount}`
}

export default function LedTicker() {
  const [events, setEvents] = useState<TickerEvent[]>(MOCK_EVENTS)
  const tickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const source = new EventSource('/api/sse/contributions')

    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as TickerEvent[]
        if (Array.isArray(data) && data.length > 0) {
          setEvents(data)
        }
      } catch {
        // ignore parse errors
      }
    }

    return () => source.close()
  }, [])

  const tickerText = events.map(formatEvent).join('   ·   ')

  return (
    <div className="w-full bg-black border-b border-amber-500/20 overflow-hidden" style={{ height: 28 }}>
      <div
        ref={tickerRef}
        className="led-ticker text-xs text-amber-400 whitespace-nowrap animate-[ticker_30s_linear_infinite]"
        style={{
          display: 'inline-block',
          paddingTop: 6,
          // CSS keyframes defined below via style tag
        }}
      >
        {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
