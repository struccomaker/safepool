import { createAuthenticatedClient } from '@interledger/open-payments'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { normalizeWalletAddress } from '@/lib/wallet-address'

let cachedClient: Awaited<ReturnType<typeof createAuthenticatedClient>> | null = null

interface GrantWithAccessToken {
  access_token: {
    value: string
    manage: string
    expires_in?: number
  }
}

interface GrantWithInteraction {
  interact: {
    redirect: string
    finish: string
  }
  continue: {
    uri: string
    access_token: {
      value: string
    }
  }
}

interface ContinueGrantDetails {
  continueUri: string
  continueAccessToken: string
}

interface CreateIncomingPaymentOptions {
  contributionId: string
  amount: number
  currency: string
  callbackUrl?: string
}

interface ContinuedIncomingPaymentOptions {
  contributionId: string
  amount: number
  currency: string
  continueGrant: ContinueGrantDetails
  interactRef: string
}

interface CreateOneTimeContributionAuthorizationOptions {
  contributionId: string
  memberWalletAddress: string
  incomingPaymentId: string
  amount: number
  currency: string
  callbackUrl?: string
}

interface ContinueOneTimeContributionAuthorizationOptions {
  memberWalletAddress: string
  quoteId: string
  continueGrant: ContinueGrantDetails
  interactRef: string
}

interface CreateOutgoingPaymentOptions {
  recipientWalletAddress: string
  amount: number
  currency: string
  metadata?: Record<string, string>
  callbackUrl?: string
}

interface ContinueOutgoingPaymentOptions {
  recipientWalletAddress: string
  amount: number
  currency: string
  metadata?: Record<string, string>
  continueGrant: ContinueGrantDetails
  interactRef: string
}

interface CreateRecurringGrantOptions {
  recurringId: string
  memberWalletAddress: string
  amount: number
  currency: string
  interval: string
  callbackUrl?: string
}

interface ContinueRecurringGrantOptions {
  continueGrant: ContinueGrantDetails
  interactRef: string
}

interface ProcessRecurringContributionOptions {
  memberWalletAddress: string
  amount: number
  currency: string
  accessToken: string
  metadata?: Record<string, string>
  quoteByDebitAmount?: boolean
}

export interface IncomingPaymentStatus {
  paymentId: string
  state: 'pending' | 'completed' | 'failed'
  receivedAmount: number
  incomingAmount: number
}

export interface OutgoingPaymentStatus {
  paymentId: string
  state: 'pending' | 'completed' | 'failed'
  debitAmount: number
}

async function upsertPaymentStatusCache(input: {
  paymentId: string
  paymentType: 'incoming' | 'outgoing'
  state: 'pending' | 'processing' | 'completed' | 'failed'
  receivedAmount: number
}): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('payment_status_cache')
    .upsert({
      payment_id: input.paymentId,
      payment_type: input.paymentType,
      state: input.state,
      received_amount: input.receivedAmount,
      last_checked: new Date().toISOString(),
    }, { onConflict: 'payment_id' })

  if (error) {
    console.error('Non-blocking payment status cache write failed', error.message)
  }
}

export type CreateIncomingPaymentResult =
  | {
    mode: 'live'
    paymentUrl: string
    incomingPaymentId: string
    currency: string
  }
  | {
    mode: 'interaction_required'
    paymentUrl: string
    redirectUrl: string
    continueUri: string
    continueAccessToken: string
    finishNonce: string
    currency: string
  }
  | {
    mode: 'demo'
    paymentUrl: string
    incomingPaymentId: string
    currency: string
  }

export type CreateOneTimeContributionAuthorizationResult =
  | {
    mode: 'live'
    outgoingPaymentId: string
    needsInteraction: false
    currency: string
  }
  | {
    mode: 'interaction_required'
    needsInteraction: true
    paymentUrl: string
    redirectUrl: string
    continueUri: string
    continueAccessToken: string
    finishNonce: string
    quoteId: string
    currency: string
  }
  | {
    mode: 'demo'
    outgoingPaymentId: string
    needsInteraction: false
    currency: string
  }

export type CreateOutgoingPaymentResult =
  | {
    status: 'completed' | 'processing' | 'failed'
    outgoingPaymentId: string
    needsInteraction: false
  }
  | {
    status: 'pending_interaction'
    outgoingPaymentId: string
    needsInteraction: true
    redirectUrl: string
    continueUri: string
    continueAccessToken: string
    finishNonce: string
  }

export type CreateRecurringGrantResult =
  | {
    mode: 'ready'
    accessToken: string
    manageUri: string
    expiresIn?: number
  }
  | {
    mode: 'interaction_required'
    redirectUrl: string
    continueUri: string
    continueAccessToken: string
    finishNonce: string
    finishKey: string
  }

export interface ContinueRecurringGrantResult {
  accessToken: string
  manageUri: string
  expiresIn?: number
}

export interface PoolWalletMetadata {
  walletAddress: string
  walletId: string
  assetCode: string
  assetScale: number
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

async function createOneTimeOutgoingFromAccessToken(
  memberWalletAddress: string,
  quoteId: string,
  accessToken: string
): Promise<{ outgoingPaymentId: string }> {
  const client = await getClient()
  const memberWallet = await client.walletAddress.get({ url: memberWalletAddress })

  const outgoingPayment = await client.outgoingPayment.create(
    { url: memberWallet.resourceServer, accessToken },
    {
      walletAddress: memberWallet.id,
      quoteId,
    }
  )

  return { outgoingPaymentId: outgoingPayment.id }
}

async function createRecurringContributionOutgoingFromAccessToken(
  memberWalletAddress: string,
  poolWalletAddress: string,
  accessToken: string,
  amount: number,
  metadata?: Record<string, string>,
  quoteByDebitAmount = false
): Promise<{ status: 'completed' | 'processing' | 'failed'; outgoingPaymentId: string; needsInteraction: false }> {
  const client = await getClient()

  console.log(`[open-payments] createRecurringOutgoing: member=${memberWalletAddress} pool=${poolWalletAddress} amount=${amount} quoteByDebit=${quoteByDebitAmount}`)

  let memberWallet, poolWallet
  try {
    memberWallet = await client.walletAddress.get({ url: memberWalletAddress })
    console.log(`[open-payments] Member wallet resolved: id=${memberWallet.id} resourceServer=${memberWallet.resourceServer} assetCode=${memberWallet.assetCode} assetScale=${memberWallet.assetScale}`)
  } catch (err) {
    console.error('[open-payments] Failed to resolve member wallet:', formatOpenPaymentsError(err))
    throw err
  }

  try {
    poolWallet = await client.walletAddress.get({ url: poolWalletAddress })
    console.log(`[open-payments] Pool wallet resolved: id=${poolWallet.id} resourceServer=${poolWallet.resourceServer} assetCode=${poolWallet.assetCode} assetScale=${poolWallet.assetScale}`)
  } catch (err) {
    console.error('[open-payments] Failed to resolve pool wallet:', formatOpenPaymentsError(err))
    throw err
  }

  // First, create an incoming payment on the pool wallet so there's a valid receiver
  let receiverUrl: string
  try {
    // Create a temporary incoming payment on the pool wallet to serve as the receiver
    const poolWalletNormalized = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
    const poolWalletMeta = await client.walletAddress.get({ url: poolWalletNormalized })

    // Request an incoming-payment grant on the pool wallet
    const incomingGrant = await client.grant.request(
      { url: poolWalletMeta.authServer },
      {
        access_token: {
          access: [{ type: 'incoming-payment', actions: ['create', 'read'] }],
        },
      }
    )

    if (!hasAccessToken(incomingGrant)) {
      console.warn('[open-payments] Could not get non-interactive incoming payment grant, falling back to wallet address as receiver')
      receiverUrl = poolWallet.id
    } else {
      const incomingPayment = await client.incomingPayment.create(
        { url: poolWalletMeta.resourceServer, accessToken: incomingGrant.access_token.value },
        {
          walletAddress: poolWalletMeta.id,
          incomingAmount: quoteByDebitAmount ? undefined : {
            value: toMinorUnits(amount, poolWalletMeta.assetScale),
            assetCode: poolWalletMeta.assetCode,
            assetScale: poolWalletMeta.assetScale,
          },
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }
      )

      receiverUrl = incomingPayment.id
      console.log(`[open-payments] Created incoming payment as receiver: ${receiverUrl}`)
    }
  } catch (err) {
    console.warn('[open-payments] Failed to create incoming payment receiver, falling back to wallet address:', formatOpenPaymentsError(err))
    receiverUrl = poolWallet.id
  }

  let quote
  try {
    const quoteParams = quoteByDebitAmount
      ? {
        walletAddress: memberWallet.id,
        receiver: receiverUrl,
        method: 'ilp' as const,
        debitAmount: {
          value: toMinorUnits(amount, memberWallet.assetScale),
          assetCode: memberWallet.assetCode,
          assetScale: memberWallet.assetScale,
        },
      }
      : {
        walletAddress: memberWallet.id,
        receiver: receiverUrl,
        method: 'ilp' as const,
        receiveAmount: {
          value: toMinorUnits(amount, poolWallet.assetScale),
          assetCode: poolWallet.assetCode,
          assetScale: poolWallet.assetScale,
        },
      }

    console.log(`[open-payments] Creating quote with params:`, JSON.stringify(quoteParams))
    quote = await client.quote.create(
      { url: memberWallet.resourceServer, accessToken },
      quoteParams
    )
    console.log(`[open-payments] Quote created: id=${quote.id} debitAmount=${JSON.stringify(quote.debitAmount)} receiveAmount=${JSON.stringify(quote.receiveAmount)}`)
  } catch (err) {
    console.error('[open-payments] ❌ Quote creation failed:', formatOpenPaymentsError(err))
    console.error('[open-payments] Full quote error:', JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2))
    throw err
  }

  let outgoingPayment
  try {
    console.log(`[open-payments] Creating outgoing payment with quoteId=${quote.id}`)
    outgoingPayment = await client.outgoingPayment.create(
      { url: memberWallet.resourceServer, accessToken },
      {
        walletAddress: memberWallet.id,
        quoteId: quote.id,
        metadata,
      }
    )
    console.log(`[open-payments] Outgoing payment created: id=${outgoingPayment.id} failed=${outgoingPayment.failed}`)
  } catch (err) {
    console.error('[open-payments] ❌ Outgoing payment creation failed:', formatOpenPaymentsError(err))
    console.error('[open-payments] Full outgoing error:', JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2))
    throw err
  }

  return {
    status: outgoingPayment.failed ? 'failed' : 'processing',
    outgoingPaymentId: outgoingPayment.id,
    needsInteraction: false,
  }
}

function maybeDecodeBase64(value: string): string {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8')
    return decoded
  } catch {
    return value
  }
}

function isPemPrivateKey(value: string): boolean {
  return value.includes('-----BEGIN') && value.includes('PRIVATE KEY-----')
}

function looksLikeBase64(value: string): boolean {
  if (!value) return false
  if (value.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/=]+$/.test(value)
}

function wrapDerBase64AsPem(value: string): string {
  const chunks = value.match(/.{1,64}/g) ?? [value]
  return `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----`
}

function readKeyFromPathIfExists(candidate: string): string | null {
  const trimmed = candidate.trim()
  if (!trimmed) return null

  const possiblePaths = [trimmed, resolve(process.cwd(), trimmed)]
  for (const path of possiblePaths) {
    if (!existsSync(path)) continue
    const fileContents = readFileSync(path, 'utf8').trim()
    if (!fileContents) continue
    return fileContents
  }

  return null
}

function normalizePrivateKeyEnv(raw: string): string {
  const trimmed = raw.trim().replace(/^"|"$/g, '')
  const withNewlines = trimmed.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')

  if (isPemPrivateKey(withNewlines)) {
    return withNewlines
  }

  const maybePathValue = readKeyFromPathIfExists(withNewlines)
  if (maybePathValue) {
    const normalizedFileValue = maybePathValue.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
    if (isPemPrivateKey(normalizedFileValue)) {
      return normalizedFileValue
    }
  }

  const decoded = maybeDecodeBase64(withNewlines).trim()
  if (isPemPrivateKey(decoded)) {
    return decoded.replace(/\\n/g, '\n')
  }

  if (looksLikeBase64(withNewlines)) {
    return wrapDerBase64AsPem(withNewlines)
  }

  throw new Error(
    'OPEN_PAYMENTS_PRIVATE_KEY is not a valid key input. Use PEM text, base64-encoded PEM, or a valid path to a PEM file.'
  )
}

function shouldRunDemoMode(): boolean {
  const raw = process.env.DEMO_MODE?.trim().toLowerCase()
  const enabled = raw === 'true' || raw === '1' || raw === 'yes'
  if (!enabled) {
    return false
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const allowInProduction = process.env.ALLOW_DEMO_MODE_IN_PRODUCTION?.trim().toLowerCase() === 'true'
  if (isProduction && !allowInProduction) {
    throw new Error('DEMO_MODE is disabled in production unless ALLOW_DEMO_MODE_IN_PRODUCTION=true')
  }

  return true
}

function toMinorUnits(amount: number, assetScale: number): string {
  return String(Math.round(amount * (10 ** assetScale)))
}

function fromMinorUnits(value?: string, assetScale = 2): number {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed / (10 ** assetScale)
}

function toMinorNumber(value?: string): number {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

function getSiteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
}

function callbackUrl(flow: 'incoming' | 'outgoing' | 'recurring', referenceId: string, explicit?: string): string {
  if (explicit) return explicit
  const base = getSiteBaseUrl()
  const param = flow === 'incoming' ? 'contribution_id' : flow === 'outgoing' ? 'payout_id' : 'recurring_id'
  return `${base}/api/payments/callback?flow=${flow}&${param}=${referenceId}`
}

function hasAccessToken(grant: unknown): grant is GrantWithAccessToken {
  if (typeof grant !== 'object' || grant === null) return false
  if (!('access_token' in grant)) return false
  const token = (grant as { access_token?: { value?: unknown } }).access_token
  return typeof token?.value === 'string'
}

function hasInteraction(grant: unknown): grant is GrantWithInteraction {
  if (typeof grant !== 'object' || grant === null) return false
  const candidate = grant as {
    interact?: { redirect?: unknown; finish?: unknown }
    continue?: { uri?: unknown; access_token?: { value?: unknown } }
  }
  return typeof candidate.interact?.redirect === 'string'
    && typeof candidate.interact?.finish === 'string'
    && typeof candidate.continue?.uri === 'string'
    && typeof candidate.continue?.access_token?.value === 'string'
}

interface OpenPaymentsErrorLike {
  message?: string
  description?: string
  status?: number
  code?: string
}

export function formatOpenPaymentsError(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return 'Internal error'
  }

  const e = err as OpenPaymentsErrorLike
  const parts = [
    e.message,
    e.description,
    typeof e.status === 'number' ? `status=${e.status}` : undefined,
    e.code ? `code=${e.code}` : undefined,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))

  if (parts.length === 0) {
    return 'Internal error'
  }

  return parts.join(' | ')
}

async function getClient() {
  if (cachedClient) return cachedClient

  const keyId = getRequiredEnv('OPEN_PAYMENTS_KEY_ID')
  const privateKey = normalizePrivateKeyEnv(getRequiredEnv('OPEN_PAYMENTS_PRIVATE_KEY'))
  const walletAddressUrl = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))

  cachedClient = await createAuthenticatedClient({
    keyId,
    privateKey,
    walletAddressUrl,
    validateResponses: false,
  })

  return cachedClient
}

export async function getPoolWalletMetadata(): Promise<PoolWalletMetadata> {
  const client = await getClient()
  const walletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const wallet = await client.walletAddress.get({ url: walletAddress })

  return {
    walletAddress,
    walletId: wallet.id,
    assetCode: wallet.assetCode,
    assetScale: wallet.assetScale,
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Open Payments fetch failed (${res.status})`)
  }

  return res.json()
}

interface CreateReusableOutgoingGrantOptions {
  grantId: string
  memberWalletAddress: string
  maxAmount: number
  currency: string
  callbackUrl?: string
}

interface RotatedAccessTokenPayload {
  value: string
  manage?: string
  expires_in?: number
}

export async function rotateAccessToken(params: {
  manageUri: string
  accessToken: string
}): Promise<{
  accessToken: string
  manageUri: string
  expiresIn?: number
}> {
  const client = await getClient()

  try {
    const rotated = await client.token.rotate({
      url: params.manageUri,
      accessToken: params.accessToken,
    })

    const newValue = rotated?.access_token?.value
    const newManage = rotated?.access_token?.manage

    if (typeof newValue !== 'string' || newValue.length === 0) {
      throw new Error('Open Payments token rotation response missing access token value')
    }

    return {
      accessToken: newValue,
      manageUri: typeof newManage === 'string' && newManage.length > 0 ? newManage : params.manageUri,
      expiresIn: rotated?.access_token?.expires_in,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown rotation error'
    throw new Error(`Failed to rotate Open Payments access token: ${message}`)
  }
}

async function createIncomingFromAccessToken(
  accessToken: string,
  amount: number,
  _currency: string,
  contributionId: string
): Promise<{ mode: 'live'; paymentUrl: string; incomingPaymentId: string; currency: string }> {
  const client = await getClient()
  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const poolWallet = await client.walletAddress.get({ url: poolWalletAddress })

  const incomingPayment = await client.incomingPayment.create(
    { url: poolWallet.resourceServer, accessToken },
    {
      walletAddress: poolWallet.id,
      incomingAmount: {
        value: toMinorUnits(amount, poolWallet.assetScale),
        assetCode: poolWallet.assetCode,
        assetScale: poolWallet.assetScale,
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  )

  return {
    mode: 'live',
    paymentUrl: incomingPayment.id,
    incomingPaymentId: incomingPayment.id,
    currency: poolWallet.assetCode,
  }
}

export async function createIncomingPayment({
  contributionId,
  amount,
  currency,
  callbackUrl: explicitCallback,
}: CreateIncomingPaymentOptions): Promise<CreateIncomingPaymentResult> {
  if (shouldRunDemoMode()) {
    const id = `demo-incoming-${contributionId}`
    return {
      mode: 'demo',
      paymentUrl: id,
      incomingPaymentId: id,
      currency,
    }
  }

  const client = await getClient()
  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const wallet = await client.walletAddress.get({ url: poolWalletAddress })
  let shouldRetryInteractive = false

  try {
    const nonInteractiveGrant = await client.grant.request(
      { url: wallet.authServer },
      {
        access_token: {
          access: [{ type: 'incoming-payment', actions: ['create', 'read'] }],
        },
      }
    )

    if (hasAccessToken(nonInteractiveGrant)) {
      return createIncomingFromAccessToken(nonInteractiveGrant.access_token.value, amount, currency, contributionId)
    }

    shouldRetryInteractive = true
  } catch {
    shouldRetryInteractive = true
  }

  if (!shouldRetryInteractive) {
    throw new Error('Incoming payment grant did not return access token for non-interactive flow')
  }

  const finishNonce = crypto.randomUUID()
  const grant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [{ type: 'incoming-payment', actions: ['create', 'read'] }],
      },
      interact: {
        start: ['redirect'],
        finish: {
          method: 'redirect',
          uri: callbackUrl('incoming', contributionId, explicitCallback),
          nonce: finishNonce,
        },
      },
    }
  )

  if (hasAccessToken(grant)) {
    return createIncomingFromAccessToken(grant.access_token.value, amount, currency, contributionId)
  }

  if (!hasInteraction(grant)) {
    throw new Error('Incoming payment grant did not return usable continuation data')
  }

  return {
    mode: 'interaction_required',
    paymentUrl: grant.interact.redirect,
    redirectUrl: grant.interact.redirect,
    continueUri: grant.continue.uri,
    continueAccessToken: grant.continue.access_token.value,
    finishNonce,
    currency: wallet.assetCode,
  }
}

export async function continueIncomingPayment({
  contributionId,
  amount,
  currency,
  continueGrant,
  interactRef,
}: ContinuedIncomingPaymentOptions): Promise<{ mode: 'live'; paymentUrl: string; incomingPaymentId: string; currency: string }> {
  const client = await getClient()

  const continuation = await client.grant.continue(
    { url: continueGrant.continueUri, accessToken: continueGrant.continueAccessToken },
    { interact_ref: interactRef }
  )

  if (!hasAccessToken(continuation)) {
    throw new Error('Incoming grant continuation did not return access token')
  }

  return createIncomingFromAccessToken(continuation.access_token.value, amount, currency, contributionId)
}

export async function createOneTimeContributionAuthorization({
  contributionId,
  memberWalletAddress,
  incomingPaymentId,
  amount,
  currency,
  callbackUrl: explicitCallback,
}: CreateOneTimeContributionAuthorizationOptions): Promise<CreateOneTimeContributionAuthorizationResult> {
  if (shouldRunDemoMode()) {
    return {
      mode: 'demo',
      outgoingPaymentId: `demo-outgoing-${contributionId}`,
      needsInteraction: false,
      currency,
    }
  }

  const client = await getClient()
  const memberWallet = normalizeWalletAddress(memberWalletAddress)
  const wallet = await client.walletAddress.get({ url: memberWallet })
  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const quoteGrant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [{ type: 'quote', actions: ['create', 'read'] }],
      },
    }
  )

  if (!hasAccessToken(quoteGrant)) {
    throw new Error('Quote grant did not return access token for one-time payment flow')
  }

  const quote = await client.quote.create(
    { url: wallet.resourceServer, accessToken: quoteGrant.access_token.value },
    {
      walletAddress: wallet.id,
      receiver: incomingPaymentId,
      method: 'ilp',
    }
  )

  const finishNonce = crypto.randomUUID()

  const grant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [{
          type: 'outgoing-payment',
          actions: ['read', 'create', 'list'],
          identifier: wallet.id,
          limits: {
            debitAmount: {
              value: quote.debitAmount.value,
              assetCode: quote.debitAmount.assetCode,
              assetScale: quote.debitAmount.assetScale,
            },
          },
        }],
      },
      interact: {
        start: ['redirect'],
        finish: {
          method: 'redirect',
          uri: callbackUrl('incoming', contributionId, explicitCallback),
          nonce: finishNonce,
        },
      },
    }
  )

  if (hasAccessToken(grant)) {
    const outgoing = await createOneTimeOutgoingFromAccessToken(memberWallet, quote.id, grant.access_token.value)
    return {
      mode: 'live',
      outgoingPaymentId: outgoing.outgoingPaymentId,
      needsInteraction: false,
      currency: wallet.assetCode,
    }
  }

  if (!hasInteraction(grant)) {
    throw new Error('One-time contribution grant did not return usable continuation data')
  }

  return {
    mode: 'interaction_required',
    needsInteraction: true,
    paymentUrl: grant.interact.redirect,
    redirectUrl: grant.interact.redirect,
    continueUri: grant.continue.uri,
    continueAccessToken: grant.continue.access_token.value,
    finishNonce,
    quoteId: quote.id,
    currency: wallet.assetCode,
  }
}

export async function continueOneTimeContributionAuthorization({
  memberWalletAddress,
  quoteId,
  continueGrant,
  interactRef,
}: ContinueOneTimeContributionAuthorizationOptions): Promise<{ outgoingPaymentId: string }> {
  const client = await getClient()
  const continuation = await client.grant.continue(
    { url: continueGrant.continueUri, accessToken: continueGrant.continueAccessToken },
    { interact_ref: interactRef }
  )

  if (!hasAccessToken(continuation)) {
    throw new Error('One-time contribution continuation did not return access token')
  }

  const memberWallet = normalizeWalletAddress(memberWalletAddress)
  return createOneTimeOutgoingFromAccessToken(memberWallet, quoteId, continuation.access_token.value)
}

export async function getIncomingPaymentStatus(paymentId: string): Promise<IncomingPaymentStatus> {
  if (paymentId.startsWith('demo-incoming-')) {
    return { paymentId, state: 'completed', receivedAmount: 0, incomingAmount: 0 }
  }

  const payload = await fetchJson(paymentId) as {
    incomingAmount?: { value?: string; assetScale?: number }
    receivedAmount?: { value?: string; assetScale?: number }
  }

  const incomingScale = typeof payload.incomingAmount?.assetScale === 'number' ? payload.incomingAmount.assetScale : 2
  const receivedScale = typeof payload.receivedAmount?.assetScale === 'number' ? payload.receivedAmount.assetScale : incomingScale

  const incomingMinor = toMinorNumber(payload.incomingAmount?.value)
  const receivedMinor = toMinorNumber(payload.receivedAmount?.value)
  const incomingAmount = fromMinorUnits(payload.incomingAmount?.value, incomingScale)
  const receivedAmount = fromMinorUnits(payload.receivedAmount?.value, receivedScale)
  const state = incomingMinor > 0 && receivedMinor >= incomingMinor ? 'completed' : 'pending'

  return { paymentId, state, receivedAmount, incomingAmount }
}

export async function pollIncomingPaymentCompletion({
  paymentId,
  expectedAmount,
  attempts = 12,
  intervalMs = 2000,
}: {
  paymentId: string
  expectedAmount: number
  attempts?: number
  intervalMs?: number
}): Promise<IncomingPaymentStatus> {
  if (paymentId.startsWith('demo-incoming-')) {
    return { paymentId, state: 'completed', receivedAmount: expectedAmount, incomingAmount: expectedAmount }
  }

  for (let i = 0; i < attempts; i += 1) {
    try {
      const status = await getIncomingPaymentStatus(paymentId)
      if (status.state === 'completed' && status.receivedAmount >= expectedAmount) {
        await upsertPaymentStatusCache({
          paymentId,
          paymentType: 'incoming',
          state: 'completed',
          receivedAmount: status.receivedAmount,
        })
        return status
      }
    } catch (err) {
      console.error('Incoming payment polling attempt failed', err)
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  await upsertPaymentStatusCache({
    paymentId,
    paymentType: 'incoming',
    state: 'pending',
    receivedAmount: 0,
  })

  return {
    paymentId,
    state: 'pending',
    receivedAmount: 0,
    incomingAmount: expectedAmount,
  }
}

async function createOutgoingFromAccessToken(
  senderWalletAddress: string,
  recipientWalletAddress: string,
  accessToken: string,
  amount: number,
  _currency: string,
  metadata?: Record<string, string>
): Promise<{ status: 'completed' | 'processing' | 'failed'; outgoingPaymentId: string; needsInteraction: false }> {
  const client = await getClient()
  const senderWallet = await client.walletAddress.get({ url: senderWalletAddress })
  const recipientWallet = await client.walletAddress.get({ url: recipientWalletAddress })

  const quote = await client.quote.create(
    { url: senderWallet.resourceServer, accessToken },
    {
      walletAddress: senderWallet.id,
      receiver: recipientWallet.id,
      method: 'ilp',
      debitAmount: {
        value: toMinorUnits(amount, senderWallet.assetScale),
        assetCode: senderWallet.assetCode,
        assetScale: senderWallet.assetScale,
      },
    }
  )

  const outgoingPayment = await client.outgoingPayment.create(
    { url: senderWallet.resourceServer, accessToken },
    {
      walletAddress: senderWallet.id,
      quoteId: quote.id,
      metadata,
    }
  )

  return {
    status: outgoingPayment.failed ? 'failed' : 'processing',
    outgoingPaymentId: outgoingPayment.id,
    needsInteraction: false,
  }
}

export async function createOutgoingPayment({
  recipientWalletAddress,
  amount,
  currency,
  metadata,
  callbackUrl: explicitCallback,
}: CreateOutgoingPaymentOptions): Promise<CreateOutgoingPaymentResult> {
  if (shouldRunDemoMode()) {
    return {
      status: 'completed',
      outgoingPaymentId: `demo-outgoing-${crypto.randomUUID()}`,
      needsInteraction: false,
    }
  }

  const client = await getClient()
  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const poolWallet = await client.walletAddress.get({ url: poolWalletAddress })

  const finishNonce = crypto.randomUUID()
  const payoutRef = metadata?.payoutId ?? crypto.randomUUID()

  const grant = await client.grant.request(
    { url: poolWallet.authServer },
    {
      access_token: {
        access: [{
          type: 'outgoing-payment',
          actions: ['read', 'create'],
          identifier: poolWallet.id,
          limits: {
            debitAmount: {
              value: toMinorUnits(amount, poolWallet.assetScale),
              assetCode: poolWallet.assetCode,
              assetScale: poolWallet.assetScale,
            },
          },
        }],
      },
      interact: {
        start: ['redirect'],
        finish: {
          method: 'redirect',
          uri: callbackUrl('outgoing', payoutRef, explicitCallback),
          nonce: finishNonce,
        },
      },
    }
  )

  if (hasAccessToken(grant)) {
    return createOutgoingFromAccessToken(
      poolWalletAddress,
      normalizeWalletAddress(recipientWalletAddress),
      grant.access_token.value,
      amount,
      currency,
      metadata
    )
  }

  if (!hasInteraction(grant)) {
    throw new Error('Outgoing payment grant did not return usable continuation data')
  }

  return {
    status: 'pending_interaction',
    outgoingPaymentId: `pending-interaction-${crypto.randomUUID()}`,
    needsInteraction: true,
    redirectUrl: grant.interact.redirect,
    continueUri: grant.continue.uri,
    continueAccessToken: grant.continue.access_token.value,
    finishNonce,
  }
}

export async function continueOutgoingPayment({
  recipientWalletAddress,
  amount,
  currency,
  metadata,
  continueGrant,
  interactRef,
}: ContinueOutgoingPaymentOptions): Promise<{ status: 'completed' | 'processing' | 'failed'; outgoingPaymentId: string; needsInteraction: false }> {
  const client = await getClient()
  const continuation = await client.grant.continue(
    { url: continueGrant.continueUri, accessToken: continueGrant.continueAccessToken },
    { interact_ref: interactRef }
  )

  if (!hasAccessToken(continuation)) {
    throw new Error('Outgoing grant continuation did not return access token')
  }

  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))

  return createOutgoingFromAccessToken(
    poolWalletAddress,
    normalizeWalletAddress(recipientWalletAddress),
    continuation.access_token.value,
    amount,
    currency,
    metadata
  )
}

export async function getOutgoingPaymentStatus(paymentId: string): Promise<OutgoingPaymentStatus> {
  if (paymentId.startsWith('demo-outgoing-')) {
    return { paymentId, state: 'completed', debitAmount: 0 }
  }

  const payload = await fetchJson(paymentId) as {
    debitAmount?: { value?: string; assetScale?: number }
    receiveAmount?: { value?: string }
    failed?: boolean
  }

  const debitScale = typeof payload.debitAmount?.assetScale === 'number' ? payload.debitAmount.assetScale : 2
  const debitAmount = fromMinorUnits(payload.debitAmount?.value, debitScale)
  const state = payload.failed ? 'failed' : payload.receiveAmount?.value ? 'completed' : 'pending'

  return { paymentId, state, debitAmount }
}

export async function pollOutgoingPaymentCompletion({
  paymentId,
  attempts = 12,
  intervalMs = 2000,
}: {
  paymentId: string
  attempts?: number
  intervalMs?: number
}): Promise<OutgoingPaymentStatus> {
  if (paymentId.startsWith('demo-outgoing-')) {
    return { paymentId, state: 'completed', debitAmount: 0 }
  }

  for (let i = 0; i < attempts; i += 1) {
    try {
      const status = await getOutgoingPaymentStatus(paymentId)
      if (status.state === 'completed' || status.state === 'failed') {
        await upsertPaymentStatusCache({
          paymentId,
          paymentType: 'outgoing',
          state: status.state,
          receivedAmount: status.debitAmount,
        })
        return status
      }
    } catch (err) {
      console.error('Outgoing payment polling attempt failed', err)
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  await upsertPaymentStatusCache({
    paymentId,
    paymentType: 'outgoing',
    state: 'pending',
    receivedAmount: 0,
  })

  return { paymentId, state: 'pending', debitAmount: 0 }
}

export async function createRecurringContributionGrant({
  recurringId,
  memberWalletAddress,
  amount,
  currency,
  interval,
  callbackUrl: explicitCallback,
}: CreateRecurringGrantOptions): Promise<CreateRecurringGrantResult> {
  if (shouldRunDemoMode()) {
    return {
      mode: 'ready',
      accessToken: `demo-recurring-token-${recurringId}`,
      manageUri: `demo-recurring-manage-${recurringId}`,
      expiresIn: 3600,
    }
  }

  const client = await getClient()
  const memberWallet = normalizeWalletAddress(memberWalletAddress)
  const wallet = await client.walletAddress.get({ url: memberWallet })
  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const poolWallet = await client.walletAddress.get({ url: poolWalletAddress })

  const finishNonce = crypto.randomUUID()

  const grant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [
          {
            type: 'quote',
            actions: ['create', 'read'],
          },
          {
            type: 'outgoing-payment',
            actions: ['read', 'create'],
            identifier: wallet.id,
            limits: {
              debitAmount: {
                value: toMinorUnits(amount, wallet.assetScale),
                assetCode: wallet.assetCode,
                assetScale: wallet.assetScale,
              },
              interval,
            },
          },
        ],
      },
      interact: {
        start: ['redirect'],
        finish: {
          method: 'redirect',
          uri: callbackUrl('recurring', recurringId, explicitCallback),
          nonce: finishNonce,
        },
      },
    }
  )

  if (hasAccessToken(grant)) {
    return {
      mode: 'ready',
      accessToken: grant.access_token.value,
      manageUri: grant.access_token.manage,
      expiresIn: grant.access_token.expires_in,
    }
  }

  if (!hasInteraction(grant)) {
    throw new Error('Recurring grant did not return usable continuation data')
  }

  return {
    mode: 'interaction_required',
    redirectUrl: grant.interact.redirect,
    continueUri: grant.continue.uri,
    continueAccessToken: grant.continue.access_token.value,
    finishNonce,
    finishKey: grant.interact.finish,
  }
}

export async function createReusableOutgoingGrant({
  grantId,
  memberWalletAddress,
  maxAmount,
  currency: _currency,
  callbackUrl: explicitCallback,
}: CreateReusableOutgoingGrantOptions): Promise<CreateRecurringGrantResult> {
  if (shouldRunDemoMode()) {
    return {
      mode: 'ready',
      accessToken: `demo-reusable-token-${grantId}`,
      manageUri: `demo-reusable-manage-${grantId}`,
      expiresIn: 3600,
    }
  }

  const client = await getClient()
  const memberWallet = normalizeWalletAddress(memberWalletAddress)
  const wallet = await client.walletAddress.get({ url: memberWallet })

  const finishNonce = crypto.randomUUID()

  const grant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [
          {
            type: 'quote',
            actions: ['create', 'read'],
          },
          {
            type: 'outgoing-payment',
            actions: ['read', 'create', 'list'],
            identifier: wallet.id,
            limits: {
              debitAmount: {
                value: toMinorUnits(maxAmount, wallet.assetScale),
                assetCode: wallet.assetCode,
                assetScale: wallet.assetScale,
              },
              // Repeating interval with no end date — debitAmount resets each period,
              // making this grant reusable across multiple payments.
              // R/ = repeating, no end count; PT1M = every 1 minute for fast demo cycling.
              interval: `R/${new Date().toISOString()}/PT1M`,
            },
          },
        ],
      },
      interact: {
        start: ['redirect'],
        finish: {
          method: 'redirect',
          uri: callbackUrl('recurring', grantId, explicitCallback),
          nonce: finishNonce,
        },
      },
    }
  )

  if (hasAccessToken(grant)) {
    return {
      mode: 'ready',
      accessToken: grant.access_token.value,
      manageUri: grant.access_token.manage,
      expiresIn: grant.access_token.expires_in,
    }
  }

  if (!hasInteraction(grant)) {
    throw new Error('Reusable outgoing grant did not return usable continuation data')
  }

  return {
    mode: 'interaction_required',
    redirectUrl: grant.interact.redirect,
    continueUri: grant.continue.uri,
    continueAccessToken: grant.continue.access_token.value,
    finishNonce,
    finishKey: grant.interact.finish,
  }
}

export async function continueRecurringContributionGrant({
  continueGrant,
  interactRef,
}: ContinueRecurringGrantOptions): Promise<ContinueRecurringGrantResult> {
  if (shouldRunDemoMode()) {
    return {
      accessToken: `demo-recurring-token-${crypto.randomUUID()}`,
      manageUri: `demo-recurring-manage-${crypto.randomUUID()}`,
      expiresIn: 3600,
    }
  }

  const client = await getClient()
  const continuation = await client.grant.continue(
    { url: continueGrant.continueUri, accessToken: continueGrant.continueAccessToken },
    { interact_ref: interactRef }
  )

  if (!hasAccessToken(continuation)) {
    throw new Error('Recurring grant continuation did not return access token')
  }

  return {
    accessToken: continuation.access_token.value,
    manageUri: continuation.access_token.manage,
    expiresIn: continuation.access_token.expires_in,
  }
}

export async function processRecurringContribution({
  memberWalletAddress,
  amount,
  currency: _currency,
  accessToken,
  metadata,
  quoteByDebitAmount = false,
}: ProcessRecurringContributionOptions): Promise<{ status: 'completed' | 'processing' | 'failed'; outgoingPaymentId: string; needsInteraction: false }> {
  if (shouldRunDemoMode()) {
    return {
      status: 'completed',
      outgoingPaymentId: `demo-outgoing-${crypto.randomUUID()}`,
      needsInteraction: false,
    }
  }

  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))

  return createRecurringContributionOutgoingFromAccessToken(
    normalizeWalletAddress(memberWalletAddress),
    poolWalletAddress,
    accessToken,
    amount,
    metadata,
    quoteByDebitAmount
  )
}
