const DEFAULT_ALLOWED_HOSTS = ['wallet.interledger-test.dev', 'ilp.interledger-test.dev']

function getAllowedWalletHosts(): string[] {
  const configured = process.env.OPEN_PAYMENTS_ALLOWED_WALLET_HOSTS
  if (!configured) return DEFAULT_ALLOWED_HOSTS

  const hosts = configured
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0)

  if (hosts.length === 0) return DEFAULT_ALLOWED_HOSTS
  return hosts
}

function ensureProtocol(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }
  return `https://${value}`
}

export function normalizeWalletAddress(input: string): string {
  const raw = input.trim()
  if (!raw) {
    throw new Error('wallet_address is required')
  }

  const withProtocol = ensureProtocol(raw)
  const parsed = new URL(withProtocol)

  if (parsed.protocol !== 'https:') {
    throw new Error('wallet_address must use https')
  }

  if (parsed.username || parsed.password) {
    throw new Error('wallet_address cannot include user credentials')
  }

  if (parsed.port) {
    throw new Error('wallet_address cannot include a port')
  }

  const host = parsed.hostname.toLowerCase()
  const allowedHosts = getAllowedWalletHosts()
  if (!allowedHosts.includes(host)) {
    throw new Error(`wallet_address host must be one of: ${allowedHosts.join(', ')}`)
  }

  if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.split('/').filter(Boolean).length !== 1) {
    throw new Error('wallet_address must include a single path segment, e.g. /safepool')
  }

  if (parsed.search || parsed.hash) {
    throw new Error('wallet_address cannot include query or fragment')
  }

  return parsed.toString().replace(/\/$/, '')
}

export function isValidWalletAddress(input: string): boolean {
  try {
    normalizeWalletAddress(input)
    return true
  } catch {
    return false
  }
}

interface WalletAddressProbe {
  id?: string
  authServer?: string
  resourceServer?: string
}

export async function verifyWalletAddressRemotely(input: string): Promise<string> {
  const normalized = normalizeWalletAddress(input)
  const shouldVerify = process.env.OPEN_PAYMENTS_VERIFY_WALLET !== 'false'

  if (!shouldVerify) {
    return normalized
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(normalized, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error('Wallet endpoint not reachable')
    }

    const payload = (await res.json()) as WalletAddressProbe
    if (!payload.id || !payload.authServer || !payload.resourceServer) {
      throw new Error('Wallet endpoint is not Open Payments compatible')
    }

    const remoteId = normalizeWalletAddress(payload.id)
    if (remoteId !== normalized) {
      throw new Error('Wallet endpoint ID does not match submitted wallet_address')
    }

    return normalized
  } finally {
    clearTimeout(timeout)
  }
}
