import { eq } from 'drizzle-orm'
import fc from 'fast-check'
import { beforeEach, describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '~/server/crypto.js'
import { extensionInstances } from '~/server/db/schema.js'
import { createTestDb } from '../helpers/db.js'

/**
 * Property 5: API Key Verschlüsselungs-Round-Trip
 *
 * Für jeden beliebigen String als API Key muss gelten:
 * encrypt(key) → in DB speichern → aus DB laden → decrypt(gespeicherter_wert)
 * ergibt den originalen Key.
 *
 * Property 12: Verschlüsselter API Key ist nicht gleich Klartext
 *
 * Für jeden beliebigen API Key muss der in der Datenbank gespeicherte
 * verschlüsselte Wert sich vom Klartext-Wert unterscheiden.
 *
 * **Validates: Requirements 2.4, 11.1**
 */

const VALID_PASSWORD = 'test-password'
const VALID_SALT = 'test-salt'

describe('Feature: mittwald-bunny-cdn, Property 5: API Key Verschlüsselungs-Round-Trip', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_PASSWORD = VALID_PASSWORD
    process.env.ENCRYPTION_SALT = VALID_SALT
    db = createTestDb()
  })

  it('encrypt → store in DB → load from DB → decrypt yields the original key', () => {
    /**
     * **Validates: Requirements 2.4**
     */
    fc.assert(
      fc.property(fc.string(), (apiKey) => {
        // Clean up from previous iteration
        db.delete(extensionInstances).run()

        const instanceId = 'test-instance'
        const now = new Date()

        // 1. Encrypt the API key
        const encrypted = encrypt(apiKey)

        // 2. Store encrypted value in DB (encryptedApiKey column)
        db.insert(extensionInstances)
          .values({
            id: instanceId,
            contextId: 'test-context',
            consentedScopes: JSON.stringify(['domain:read', 'domain:write']),
            encryptedApiKey: encrypted,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        // 3. Load from DB
        const stored = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()

        expect(stored).toBeDefined()
        expect(stored?.encryptedApiKey).toBeDefined()
        if (!stored?.encryptedApiKey) throw new Error('unreachable: assertion above already passed')

        // 4. Decrypt the stored value
        const decrypted = decrypt(stored.encryptedApiKey)

        // 5. Must equal the original
        expect(decrypted).toBe(apiKey)
      }),
      { numRuns: 100 },
    )
  })
})

describe('Feature: mittwald-bunny-cdn, Property 12: Verschlüsselter API Key ist nicht gleich Klartext', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_PASSWORD = VALID_PASSWORD
    process.env.ENCRYPTION_SALT = VALID_SALT
  })

  it('the encrypted value stored in the DB must differ from the plaintext API key', () => {
    /**
     * **Validates: Requirements 11.1**
     */
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (apiKey) => {
        // Encrypt the API key
        const encrypted = encrypt(apiKey)

        // The encrypted value must not equal the plaintext
        expect(encrypted).not.toBe(apiKey)
      }),
      { numRuns: 100 },
    )
  })
})
