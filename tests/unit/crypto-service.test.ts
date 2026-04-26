import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetKeyCache } from '~/server/crypto'
import { decrypt, encrypt } from '~/server/crypto.js'
import { ErrorType } from '~/shared/errors.js'

// Generate a valid 32-byte key as hex
const VALID_PASSWORD = 'test-password'
const VALID_SALT = 'test-salt'

describe('CryptoService', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_PASSWORD = VALID_PASSWORD
    process.env.ENCRYPTION_SALT = VALID_SALT
  })

  afterEach(() => {
    _resetKeyCache()
    delete process.env.ENCRYPTION_MASTER_PASSWORD
    delete process.env.ENCRYPTION_SALT
  })

  describe('encrypt/decrypt round-trip', () => {
    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'my-secret-api-key-12345'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt an empty string', () => {
      const encrypted = encrypt('')
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe('')
    })

    it('should encrypt and decrypt unicode content', () => {
      const plaintext = 'Schlüssel mit Ümlauten 🔑'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const plaintext = 'same-input'
      const a = encrypt(plaintext)
      const b = encrypt(plaintext)
      expect(a).not.toBe(b)
    })

    it('should produce base64 output', () => {
      const encrypted = encrypt('test')
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow()
      // Re-encoding should match (valid base64)
      expect(Buffer.from(encrypted, 'base64').toString('base64')).toBe(encrypted)
    })
  })

  describe('encrypted value differs from plaintext', () => {
    it('should not equal the plaintext', () => {
      const plaintext = 'my-api-key'
      const encrypted = encrypt(plaintext)
      expect(encrypted).not.toBe(plaintext)
    })
  })

  describe('error handling', () => {
    it('should throw CRYPTO_ERROR when ENCRYPTION_MASTER_PASSWORD is missing', () => {
      delete process.env.ENCRYPTION_MASTER_PASSWORD
      delete process.env.ENCRYPTION_SALT
      expect(() => encrypt('test')).toThrow()
      try {
        encrypt('test')
      } catch (e: unknown) {
        const err = e as { type: string }
        expect(err.type).toBe(ErrorType.CRYPTO_ERROR)
      }
    })

    it('should throw CRYPTO_ERROR when encryption env vars are invalid', () => {
      process.env.ENCRYPTION_MASTER_PASSWORD = ''
      process.env.ENCRYPTION_SALT = ''
      expect(() => encrypt('test')).toThrow()
      try {
        encrypt('test')
      } catch (e: unknown) {
        const err = e as { type: string }
        expect(err.type).toBe(ErrorType.CRYPTO_ERROR)
      }
    })

    it('should throw CRYPTO_ERROR when encryption env vars are missing chars', () => {
      delete process.env.ENCRYPTION_MASTER_PASSWORD
      expect(() => encrypt('test')).toThrow()
      try {
        encrypt('test')
      } catch (e: unknown) {
        const err = e as { type: string }
        expect(err.type).toBe(ErrorType.CRYPTO_ERROR)
      }
    })

    it('should throw CRYPTO_ERROR when decrypting tampered ciphertext', () => {
      const encrypted = encrypt('test')
      // Tamper with the ciphertext
      const buf = Buffer.from(encrypted, 'base64')
      buf[buf.length - 1] ^= 0xff
      const tampered = buf.toString('base64')

      expect(() => decrypt(tampered)).toThrow()
      try {
        decrypt(tampered)
      } catch (e: unknown) {
        const err = e as { type: string }
        expect(err.type).toBe(ErrorType.CRYPTO_ERROR)
      }
    })

    it('should throw CRYPTO_ERROR when ciphertext is too short', () => {
      const tooShort = Buffer.alloc(20).toString('base64') // < IV + authTag + 1
      expect(() => decrypt(tooShort)).toThrow()
      try {
        decrypt(tooShort)
      } catch (e: unknown) {
        const err = e as { type: string }
        expect(err.type).toBe(ErrorType.CRYPTO_ERROR)
      }
    })

    it('should throw CRYPTO_ERROR when decrypting with wrong key', () => {
      const encrypted = encrypt('test')
      // Switch to a different key and reset cache
      _resetKeyCache()
      process.env.ENCRYPTION_MASTER_PASSWORD = randomBytes(16).toString('hex')
      process.env.ENCRYPTION_SALT = randomBytes(8).toString('hex')
      expect(() => decrypt(encrypted)).toThrow()
      try {
        decrypt(encrypted)
      } catch (e: unknown) {
        const err = e as { type: string }
        expect(err.type).toBe(ErrorType.CRYPTO_ERROR)
      }
    })
  })
})
