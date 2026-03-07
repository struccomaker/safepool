'use client'
import { useEffect, useState } from 'react'

interface TickerItem {
  member_name: string
  pool_name: string
  amount: number
  currency: string
  contributed_at: string
}

const MOCK: TickerItem[] = [
  { member_name: 'MARIA S.', pool_name: 'MANILA FLOOD RELIEF', amount: 10, currency: 'USD', contributed_at: '' },
  { member_name: 'JOSE R.', pool_name: 'MANILA FLOOD RELIEF', amount: 25, currency: 'USD', contributed_at: '' },
  { member_name: 'ANA C.', pool_name: 'MANILA FLOOD RELIEF', amount: 10, currency: 'USD', contributed_at: '' },
  { member_name: 'PEDRO L.', pool_name: 'MANILA FLOOD RELIEF', amount: 50, currency: 'USD', contributed_at: '' },
  { member_name: 'LUZ G.', pool_name: 'JAKARTA QUAKE POOL', amount: 15, currency: 'USD', contributed_at: '' },
  { member_name: 'AHMED K.', pool_name: 'NEPAL RELIEF FUND', amount: 30, currency: 'USD', contributed_at: '' },
]

export default function LedTicker() {
  const [items, setItems] = useState<TickerItem[]>(MOCK)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/sse/contributions')
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as TickerItem[]
        if (data.length > 0) {
          setItems(data.map(d => ({
            ...d,
            member_name: d.member_name.toUpperCase(),
            pool_name: d.pool_name.toUpperCase(),
          })))
          setLive(true)
        }
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => setLive(false)
    return () => es.close()
  }, [])

  // Triple-duplicate for seamless infinite loop
  const display = [...items, ...items, ...items]

  return (
    <div
      className="led-panel h-10 overflow-hidden flex items-center z-50 relative border-b border-amber-900/40"
      style={{ fontFamily: "'VT323', monospace" }}
    >
      {/* Fixed left badge */}
      <div
        className="flex-shrink-0 h-full flex items-center px-4 border-r border-amber-800/60 z-10"
        style={{
          background: '#0f0600',
          boxShadow: 'inset 0 0 12px rgba(255,100,0,0.15)',
        }}
      >
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${live ? 'animate-pulse' : ''}`}
          style={{
            background: live ? '#FF8C00' : '#664400',
            boxShadow: live ? '0 0 6px #FF8C00, 0 0 12px #FF6600' : 'none',
          }}
        />
        <span
          className="text-lg tracking-widest whitespace-nowrap"
          style={{
            color: '#FF8C00',
            textShadow: '0 0 6px #FF8C00, 0 0 12px #FF6600',
          }}
        >
          SAFEPOOL LIVE
        </span>
      </div>

      {/* Scrolling LED content */}
      <div className="flex-1 overflow-hidden">
        <div className="led-track flex items-center">
          {display.map((item, i) => (
            <span key={i} className="flex items-center whitespace-nowrap text-lg">
              <span
                className="mx-5 text-base"
                style={{ color: '#FF4400', textShadow: '0 0 8px #FF4400' }}
              >
                ◆
              </span>
              <span style={{ color: '#FFB830', textShadow: '0 0 6px #FFB830, 0 0 10px #FF8C00' }}>
                {item.member_name}
              </span>
              <span
                className="mx-2"
                style={{ color: '#22FF88', textShadow: '0 0 6px #22FF88, 0 0 12px #00FF66' }}
              >
                +${item.amount.toFixed(2)} {item.currency}
              </span>
              <span style={{ color: '#FF6600', textShadow: '0 0 4px #FF6600' }}>→</span>
              <span className="ml-2" style={{ color: '#CC6600', textShadow: '0 0 4px #CC4400' }}>
                {item.pool_name}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
