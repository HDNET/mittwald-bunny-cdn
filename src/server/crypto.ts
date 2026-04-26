import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { createAppError, ErrorType, isAppError } from '~/shared/errors.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

// scrypt cost parameters — set explicitly so SECURITY.md and the code stay in
// sync. N=2^15 matches OWASP 2024's recommended minimum and is sized for our
// threat model: the derived key is cached for the process lifetime, so the
// cost is paid once at boot, and the only attacker scenario worth pricing
// against is "has env vars but somehow not the resulting 32-byte key" — which
// is implausible in this single-tenant deploy. 2^15 keeps cold-boot fast and
// peak memory under 64 MB.
const SCRYPT_N = 1 << 15
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_MAXMEM = 64 * 1024 * 1024

let cachedKey: Buffer | null = null

/** Reset cached key — for testing only */
export function _resetKeyCache() {
  cachedKey = null
}

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey

  const password = process.env.ENCRYPTION_MASTER_PASSWORD
  const salt = process.env.ENCRYPTION_SALT

  if (!password || !salt) {
    throw createAppError(
      ErrorType.CRYPTO_ERROR,
      'Verschlüsselung nicht konfiguriert. Bitte ENCRYPTION_MASTER_PASSWORD und ENCRYPTION_SALT setzen.',
      { details: 'ENCRYPTION_MASTER_PASSWORD or ENCRYPTION_SALT not set' },
    )
  }

  // Pinned scrypt parameters (see SCRYPT_* constants). Derived key is cached
  // for the process lifetime, so the cost is paid once at boot.
  cachedKey = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
  return cachedKey
}

export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey()
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    const combined = Buffer.concat([iv, encrypted, authTag])
    return combined.toString('base64')
  } catch (error) {
    if (isAppError(error)) throw error
    throw createAppError(ErrorType.CRYPTO_ERROR, 'Verschlüsselung fehlgeschlagen.', {
      details: error instanceof Error ? error.message : String(error),
    })
  }
}

export function decrypt(ciphertext: string): string {
  try {
    const key = getEncryptionKey()
    const combined = Buffer.from(ciphertext, 'base64')

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw createAppError(ErrorType.CRYPTO_ERROR, 'Entschlüsselung fehlgeschlagen. Bitte API Key neu eingeben.', {
        details: 'Ciphertext too short',
      })
    }

    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)

    // Hard-fail on any auth tag shorter than 16 bytes. Without this check, Node
    // would accept a truncated tag (down to 4 bytes) and the GCM forgery attack
    // becomes feasible via brute force. authTagLength locks both sides to 16.
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw createAppError(ErrorType.CRYPTO_ERROR, 'Entschlüsselung fehlgeschlagen. Bitte API Key neu eingeben.', {
        details: `Invalid auth tag length: ${authTag.length}`,
      })
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch (error) {
    if (isAppError(error)) throw error
    throw createAppError(ErrorType.CRYPTO_ERROR, 'Entschlüsselung fehlgeschlagen. Bitte API Key neu eingeben.', {
      details: error instanceof Error ? error.message : String(error),
    })
  }
}
