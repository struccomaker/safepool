/**
 * Shared singleton that tracks the Brazil earthquake demo status.
 * Registers window event listeners at module-load time so the value
 * is always current, even when CountryDrilldownMap is not yet mounted.
 */

export type BrazilStatus = 'Triggered' | 'Payout Given' | 'Monitoring' | null

let _current: BrazilStatus = null

export function getBrazilStatus(): BrazilStatus {
  return _current
}

if (typeof window !== 'undefined') {
  window.addEventListener('safepool:earthquake-demo',     () => { _current = 'Triggered'    })
  window.addEventListener('safepool:earthquake-resolved', () => { _current = 'Payout Given' })
  window.addEventListener('safepool:earthquake-end',      () => { _current = 'Monitoring'   })
}
