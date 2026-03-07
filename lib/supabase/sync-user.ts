import { normalizeWalletAddress } from '@/lib/wallet-address'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

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
  const admin = createSupabaseAdminClient()
  const supabaseWalletAddress = getSupabaseWalletAddress(user)

  const { data: walletRows, error: walletQueryError } = await admin
    .from('user_wallets')
    .select('wallet_address')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (walletQueryError) {
    throw new Error(`Failed to load user wallet binding: ${walletQueryError.message}`)
  }

  if (supabaseWalletAddress) {
    if (walletRows.length > 0 && normalizeWalletAddress(walletRows[0].wallet_address) === supabaseWalletAddress) {
      return supabaseWalletAddress
    }

    const { error: clearDefaultsError } = await admin
      .from('user_wallets')
      .update({ is_default: false })
      .eq('user_id', user.id)

    if (clearDefaultsError) {
      throw new Error(`Failed to update wallet defaults: ${clearDefaultsError.message}`)
    }

    const { error: insertWalletError } = await admin
      .from('user_wallets')
      .insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        wallet_address: supabaseWalletAddress,
        provider: getWalletProvider(supabaseWalletAddress),
        status: 'provisioned',
        is_default: true,
      })

    if (insertWalletError) {
      throw new Error(`Failed to persist user wallet binding: ${insertWalletError.message}`)
    }

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

  const { error: clearDefaultsError } = await admin
    .from('user_wallets')
    .update({ is_default: false })
    .eq('user_id', user.id)

  if (clearDefaultsError) {
    throw new Error(`Failed to clear existing default wallets: ${clearDefaultsError.message}`)
  }

  const { error: insertWalletError } = await admin
    .from('user_wallets')
    .insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      wallet_address: walletAddress,
      provider: getWalletProvider(walletAddress),
      status,
      is_default: true,
    })

  if (insertWalletError) {
    throw new Error(`Failed to create default wallet binding: ${insertWalletError.message}`)
  }

  return walletAddress
}

export async function getLatestUserWalletBinding(userId: string): Promise<UserWalletBinding | null> {
  const admin = createSupabaseAdminClient()
  const { data: rows, error } = await admin
    .from('user_wallets')
    .select('wallet_address,status,provider')
    .eq('user_id', userId)
    .eq('is_default', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to query user wallet binding: ${error.message}`)
  }

  if (rows.length === 0) return null

  return {
    wallet_address: rows[0].wallet_address,
    status: rows[0].status as UserWalletBinding['status'],
    provider: rows[0].provider,
  }
}

export async function syncSupabaseUserToClickHouse(user: SupabaseUserLike): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error: upsertUserError } = await admin
    .from('users')
    .upsert({
      id: user.id,
      email: user.email ?? '',
      name: getDisplayName(user),
    }, { onConflict: 'id' })

  if (upsertUserError) {
    throw new Error(`Failed to sync authenticated user: ${upsertUserError.message}`)
  }

  await getOrCreateUserWalletAddress(user)
}
