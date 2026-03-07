import { createAuthenticatedClient } from '@interledger/open-payments'
import { insertRows } from '@/lib/clickhouse'
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
  finishNonce: string
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

export type CreateIncomingPaymentResult =
  | {
      mode: 'live'
      paymentUrl: string
      incomingPaymentId: string
    }
  | {
      mode: 'interaction_required'
      paymentUrl: string
      redirectUrl: string
      continueUri: string
      continueAccessToken: string
      finishNonce: string
    }
  | {
      mode: 'demo'
      paymentUrl: string
      incomingPaymentId: string
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
    }

export interface ContinueRecurringGrantResult {
  accessToken: string
  manageUri: string
  expiresIn?: number
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function shouldRunDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true'
}

function toMinorUnits(amount: number): string {
  return String(Math.round(amount * 100))
}

function fromMinorUnits(value?: string): number {
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed / 100
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
    interact?: { redirect?: unknown }
    continue?: { uri?: unknown; access_token?: { value?: unknown } }
  }
  return typeof candidate.interact?.redirect === 'string'
    && typeof candidate.continue?.uri === 'string'
    && typeof candidate.continue?.access_token?.value === 'string'
}

async function getClient() {
  if (cachedClient) return cachedClient

  const keyId = getRequiredEnv('OPEN_PAYMENTS_KEY_ID')
  const privateKey = getRequiredEnv('OPEN_PAYMENTS_PRIVATE_KEY')
  const walletAddressUrl = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))

  cachedClient = await createAuthenticatedClient({
    keyId,
    privateKey,
    walletAddressUrl,
  })

  return cachedClient
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

async function createIncomingFromAccessToken(
  accessToken: string,
  amount: number,
  currency: string,
  contributionId: string
): Promise<{ mode: 'live'; paymentUrl: string; incomingPaymentId: string }> {
  const client = await getClient()
  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const poolWallet = await client.walletAddress.get({ url: poolWalletAddress })

  const incomingPayment = await client.incomingPayment.create(
    { url: poolWallet.resourceServer, accessToken },
    {
      walletAddress: poolWallet.id,
      incomingAmount: {
        value: toMinorUnits(amount),
        assetCode: currency,
        assetScale: 2,
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  )

  return {
    mode: 'live',
    paymentUrl: incomingPayment.id,
    incomingPaymentId: incomingPayment.id,
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
    }
  }

  const client = await getClient()
  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))
  const wallet = await client.walletAddress.get({ url: poolWalletAddress })

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
  }
}

export async function continueIncomingPayment({
  contributionId,
  amount,
  currency,
  continueGrant,
  interactRef,
}: ContinuedIncomingPaymentOptions): Promise<{ mode: 'live'; paymentUrl: string; incomingPaymentId: string }> {
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

export async function getIncomingPaymentStatus(paymentId: string): Promise<IncomingPaymentStatus> {
  if (paymentId.startsWith('demo-incoming-')) {
    return { paymentId, state: 'completed', receivedAmount: 0, incomingAmount: 0 }
  }

  const payload = await fetchJson(paymentId) as {
    incomingAmount?: { value?: string }
    receivedAmount?: { value?: string }
  }

  const incomingAmount = fromMinorUnits(payload.incomingAmount?.value)
  const receivedAmount = fromMinorUnits(payload.receivedAmount?.value)
  const state = incomingAmount > 0 && receivedAmount >= incomingAmount ? 'completed' : 'pending'

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
    const status = await getIncomingPaymentStatus(paymentId)
    if (status.state === 'completed' && status.receivedAmount >= expectedAmount) {
      await insertRows('payment_status_cache', [{
        payment_id: paymentId,
        payment_type: 'incoming',
        state: 'completed',
        received_amount: status.receivedAmount,
      }])
      return status
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  await insertRows('payment_status_cache', [{
    payment_id: paymentId,
    payment_type: 'incoming',
    state: 'pending',
    received_amount: 0,
  }])

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
  currency: string,
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
        value: toMinorUnits(amount),
        assetCode: currency,
        assetScale: 2,
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
              value: toMinorUnits(amount),
              assetCode: currency,
              assetScale: 2,
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
    debitAmount?: { value?: string }
    receiveAmount?: { value?: string }
    failed?: boolean
  }

  const debitAmount = fromMinorUnits(payload.debitAmount?.value)
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
    const status = await getOutgoingPaymentStatus(paymentId)
    if (status.state === 'completed' || status.state === 'failed') {
      await insertRows('payment_status_cache', [{
        payment_id: paymentId,
        payment_type: 'outgoing',
        state: status.state,
        received_amount: status.debitAmount,
      }])
      return status
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  await insertRows('payment_status_cache', [{
    payment_id: paymentId,
    payment_type: 'outgoing',
    state: 'pending',
    received_amount: 0,
  }])

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

  const finishNonce = crypto.randomUUID()

  const grant = await client.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [{
          type: 'outgoing-payment',
          actions: ['read', 'create'],
          identifier: wallet.id,
          limits: {
            debitAmount: {
              value: toMinorUnits(amount),
              assetCode: currency,
              assetScale: 2,
            },
            interval,
          },
        }],
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
  currency,
  accessToken,
  metadata,
}: ProcessRecurringContributionOptions): Promise<{ status: 'completed' | 'processing' | 'failed'; outgoingPaymentId: string; needsInteraction: false }> {
  if (shouldRunDemoMode()) {
    return {
      status: 'completed',
      outgoingPaymentId: `demo-outgoing-${crypto.randomUUID()}`,
      needsInteraction: false,
    }
  }

  const poolWalletAddress = normalizeWalletAddress(getRequiredEnv('POOL_WALLET_ADDRESS'))

  return createOutgoingFromAccessToken(
    normalizeWalletAddress(memberWalletAddress),
    poolWalletAddress,
    accessToken,
    amount,
    currency,
    metadata
  )
}
