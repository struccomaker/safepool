import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENC_PREFIX = 'enc:v1:'

function getKeyBuffer(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY

  if (!key) {
    throw new Error('Missing required environment variable: APP_ENCRYPTION_KEY')
  }

  return createHash('sha256').update(key).digest()
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
