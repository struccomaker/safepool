import { insertRows, queryRows } from '@/lib/clickhouse'
import { normalizeWalletAddress } from '@/lib/wallet-address'

interface SupabaseUserLike {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

export interface UserWalletBinding {
  wallet_address: string
  status: 'provisioned' | 'manual_required'
  provider: string
}

function getDisplayName(user: SupabaseUserLike): string {
  const fullName = user.user_metadata?.full_name
  const metadataName = typeof fullName === 'string' ? fullName.trim() : ''

  if (metadataName) return metadataName
  if (user.email) return user.email.split('@')[0]
  return 'SafePool User'
}

function getSupabaseWalletAddress(user: SupabaseUserLike): string | null {
  const maybeWallet = user.user_metadata?.wallet_address
  if (typeof maybeWallet !== 'string') return null

  try {
    return normalizeWalletAddress(maybeWallet)
  } catch {
    return null
  }
}

function getWalletProvider(walletAddress: string): string {
  try {
    return new URL(walletAddress).hostname
  } catch {
    return 'wallet.interledger-test.dev'
  }
}

function sanitizeWalletHandle(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const compact = normalized.replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!compact) return 'member'
  return compact.slice(0, 40)
}

function getDemoWalletCandidates(): string[] {
  const configured = process.env.DEMO_MEMBER_WALLETS ?? ''
  return configured
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function pickDeterministicDemoWallet(userId: string, candidates: string[]): string {
  let checksum = 0
  for (let i = 0; i < userId.length; i += 1) {
    checksum = (checksum + userId.charCodeAt(i)) % 2147483647
  }
  const index = checksum % candidates.length
  return candidates[index]
}

function deriveWalletAddress(user: SupabaseUserLike): string {
  const baseUrl = (process.env.OPEN_PAYMENTS_USER_WALLET_BASE_URL ?? 'https://wallet.interledger-test.dev').replace(/\/$/, '')
  const emailPart = user.email?.split('@')[0] ?? ''
  const handleSeed = emailPart || user.id
  const handle = sanitizeWalletHandle(`safepool-${handleSeed}-${user.id.slice(0, 8)}`)
  return `${baseUrl}/${handle}`
}

export async function getOrCreateUserWalletAddress(user: SupabaseUserLike): Promise<string> {
  const supabaseWalletAddress = getSupabaseWalletAddress(user)

  const walletRows = await queryRows<{ wallet_address: string }>(
    `
    SELECT wallet_address
    FROM user_wallets
    WHERE user_id = toUUID({user_id:String})
      AND is_default = 1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    { user_id: user.id }
  )

  if (supabaseWalletAddress) {
    if (walletRows.length > 0 && normalizeWalletAddress(walletRows[0].wallet_address) === supabaseWalletAddress) {
      return supabaseWalletAddress
    }

    await insertRows('user_wallets', [{
      id: crypto.randomUUID(),
      user_id: user.id,
      wallet_address: supabaseWalletAddress,
      provider: getWalletProvider(supabaseWalletAddress),
      status: 'provisioned',
      is_default: 1,
    }])

    return supabaseWalletAddress
  }

  if (walletRows.length > 0) {
    return walletRows[0].wallet_address
  }

  const demoWalletCandidates = getDemoWalletCandidates()
  const hasPreprovisionedWallets = demoWalletCandidates.length > 0
  const walletAddress = hasPreprovisionedWallets
    ? pickDeterministicDemoWallet(user.id, demoWalletCandidates)
    : deriveWalletAddress(user)
  const status = hasPreprovisionedWallets ? 'provisioned' : 'manual_required'

  await insertRows('user_wallets', [{
    id: crypto.randomUUID(),
    user_id: user.id,
    wallet_address: walletAddress,
    provider: getWalletProvider(walletAddress),
    status,
    is_default: 1,
  }])

  return walletAddress
}

export async function getLatestUserWalletBinding(userId: string): Promise<UserWalletBinding | null> {
  const rows = await queryRows<{
    wallet_address: string
    status: string
    provider: string
  }>(
    `
    SELECT wallet_address, toString(status) AS status, provider
    FROM user_wallets
    WHERE user_id = toUUID({user_id:String})
      AND is_default = 1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    { user_id: userId }
  )

  if (rows.length === 0) return null

  return {
    wallet_address: rows[0].wallet_address,
    status: rows[0].status as UserWalletBinding['status'],
    provider: rows[0].provider,
  }
}

export async function syncSupabaseUserToClickHouse(user: SupabaseUserLike): Promise<void> {
  const existing = await queryRows<{ row_exists: number }>(
    `
    SELECT 1 AS row_exists
    FROM users
    WHERE users.id = toUUID({id:String})
    LIMIT 1
    `,
    { id: user.id }
  )

  if (existing.length === 0) {
    await insertRows('users', [{
      id: user.id,
      email: user.email ?? '',
      name: getDisplayName(user),
    }])
  }

  await getOrCreateUserWalletAddress(user)
}
