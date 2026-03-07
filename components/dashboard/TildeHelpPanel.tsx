'use client'

import { useEffect, useState } from 'react'

const shortcuts = [
  { key: '1', label: 'Add fund to pool' },
  { key: '2', label: 'Mock earthquake' },
  { key: '3', label: 'Governance rule change' },
]

export default function TildeHelpPanel() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        const target = e.target as HTMLElement | null
        if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!open) return null

  return (
    <div
      className="pointer-events-auto absolute bottom-8 left-1/2 z-50 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150"
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div className="rounded-xl border border-white/15 bg-black/80 px-6 py-4 backdrop-blur-md"
        style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
          Keyboard shortcuts
        </p>
        <div className="space-y-2">
          {shortcuts.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <kbd className="flex h-7 w-7 items-center justify-center rounded border border-white/20 bg-white/10 font-mono text-sm font-bold text-white">
                {key}
              </kbd>
              <span className="text-sm text-white/75">{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-white/25">
          Press ~ to close
        </p>
      </div>
    </div>
  )
}
