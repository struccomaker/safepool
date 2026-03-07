'use client'

export async function resolveVoting(): Promise<void> {
  const res = await fetch('/api/governance/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`Resolution failed: ${res.statusText}`)
  }

  return res.json()
}
