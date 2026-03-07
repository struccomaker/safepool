import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENC_PREFIX = 'enc:v1:'
let warnedAboutDerivedKey = false

function shouldRunDemoMode(): boolean {
  const raw = process.env.DEMO_MODE?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function getKeyBuffer(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY

  if (key) {
    return createHash('sha256').update(key).digest()
  }

  const fallbackSeed = process.env.OPEN_PAYMENTS_PRIVATE_KEY ?? process.env.OPEN_PAYMENTS_KEY_ID

  if (fallbackSeed) {
    if (!warnedAboutDerivedKey) {
      console.warn('APP_ENCRYPTION_KEY is missing; deriving encryption key from Open Payments env for local compatibility.')
      warnedAboutDerivedKey = true
    }

    return createHash('sha256').update(fallbackSeed).digest()
  }

  if (shouldRunDemoMode()) {
    return createHash('sha256').update('safepool-demo-encryption-key').digest()
  }

  throw new Error('Missing required environment variable: APP_ENCRYPTION_KEY')
}

export function encryptSecret(value: string): string {
  if (!value) return value
  if (value.startsWith(ENC_PREFIX)) return value

  const key = getKeyBuffer()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(value: string): string {
  if (!value) return value
  if (!value.startsWith(ENC_PREFIX)) return value

  const payload = value.slice(ENC_PREFIX.length)
  const [ivBase64, tagBase64, encryptedBase64] = payload.split(':')
  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error('Invalid encrypted secret payload format')
  }

  const key = getKeyBuffer()
  const iv = Buffer.from(ivBase64, 'base64')
  const tag = Buffer.from(tagBase64, 'base64')
  const encrypted = Buffer.from(encryptedBase64, 'base64')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
