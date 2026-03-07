'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await signIn('credentials', { email, callbackUrl: '/dashboard' })
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🌐</div>
          <h1 className="text-2xl font-bold">Sign in to SafePool</h1>
          <p className="text-gray-400 text-sm mt-1">Use a demo email to get started</p>
        </div>
        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:border-green-500/50 focus:outline-none"
              placeholder="maria@demo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-4 p-3 bg-white/5 rounded-lg">
          <p className="text-gray-500 text-xs text-center">Demo accounts: maria@demo.com, jose@demo.com, ana@demo.com</p>
        </div>
      </div>
    </div>
  )
}
