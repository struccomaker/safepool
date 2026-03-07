'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-red-400 mb-2">Something went wrong</h2>
        <p className="text-white/50 mb-6">{error.message}</p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
