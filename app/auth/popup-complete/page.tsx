'use client'

import { useEffect } from 'react'

export default function AuthPopupCompletePage() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage('safepool-auth-success', window.location.origin)
      window.close()
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div className="max-w-sm rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/70">Authentication complete. You can close this window.</p>
      </div>
    </div>
  )
}
