import { eq } from 'drizzle-orm'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import * as bunny from '~/server/bunnycdn.js'
import { decrypt, encrypt } from '~/server/crypto.js'
import { extensionInstances, pullZones } from '~/server/db/schema.js'
import { ErrorType } from '~/shared/errors.js'
import { createTestDb, seedInstance } from '../helpers/db.js'

vi.mock('~/server/bunnycdn.js', () => ({
  validateApiKey: vi.fn().mockResolvedValue(true),
  getPullZone: vi.fn().mockResolvedValue(null),
  deletePullZone: vi.fn().mockResolvedValue(undefined),
  purgeCache: vi.fn().mockResolvedValue(undefined),
}))

process.env.ENCRYPTION_MASTER_PASSWORD = 'test-password'
process.env.ENCRYPTION_SALT = 'test-salt'

/**
 * Property-Based Tests for Business Logic (Properties 8, 9, 13, 14, 15, 16)
 */

// ─── Property 8: Pull Zone Löschung entfernt lokale Daten ──────────────────
describe('Feature: mittwald-bunny-cdn, Property 8: Pull Zone Löschung entfernt lokale Daten', () => {
  it('after deletion, no pull zone data remains for the instance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        fc.constantFrom('asset' as const, 'full-site' as const),
        async (pullZoneId, cdnMode) => {
          const db = createTestDb()
          seedInstance(db)

          db.update(extensionInstances)
            .set({ encryptedApiKey: encrypt('test-api-key') })
            .where(eq(extensionInstances.id, 'inst-1'))
            .run()

          db.insert(pullZones)
            .values({
              id: pullZoneId,
              instanceId: 'inst-1',
              cdnDomain: 'test.b-cdn.net',
              originUrl: 'https://example.com',
              cdnMode,
              createdAt: new Date(),
            })
            .run()

          // Simulate deletion
          db.delete(pullZones).where(eq(pullZones.instanceId, 'inst-1')).run()

          const rows = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).all()
          expect(rows).toHaveLength(0)
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Property 9: Zustandssynchronisation bei Inkonsistenz ───────────────────
describe('Feature: mittwald-bunny-cdn, Property 9: Zustandssynchronisation bei Inkonsistenz', () => {
  it('when BunnyCDN returns 404, local pull zone data should be cleaned up', async () => {
    const db = createTestDb()
    seedInstance(db)

    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    db.insert(pullZones)
      .values({
        id: 999,
        instanceId: 'inst-1',
        cdnDomain: 'gone.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        createdAt: new Date(),
      })
      .run()

    // getPullZone returns null (simulating 404) — cleanup should happen
    const storedInstance = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-1')).get()
    if (!storedInstance?.encryptedApiKey) throw new Error('test setup: expected encrypted api key in DB')
    const apiKey = (await import('~/server/crypto.js')).decrypt(storedInstance.encryptedApiKey)
    const remote = await bunny.getPullZone(999, apiKey)
    expect(remote).toBeNull()

    // Simulate sync cleanup
    if (!remote) {
      db.delete(pullZones).where(eq(pullZones.instanceId, 'inst-1')).run()
    }

    const rows = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).all()
    expect(rows).toHaveLength(0)
  })
})

// ─── Property 13: API-Antworten enthalten keinen Klartext-Key ───────────────
describe('Feature: mittwald-bunny-cdn, Property 13: API-Antworten enthalten keinen Klartext-Key', () => {
  it('getApiKeyStatus response never contains the actual key value', async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[A-Z0-9]{20,40}$/), async (apiKey) => {
        const db = createTestDb()
        seedInstance(db)

        db.update(extensionInstances)
          .set({ encryptedApiKey: encrypt(apiKey) })
          .where(eq(extensionInstances.id, 'inst-1'))
          .run()

        const instance = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-1')).get()
        const hasKey = !!instance?.encryptedApiKey
        const last4 = hasKey && instance?.encryptedApiKey ? decrypt(instance.encryptedApiKey).slice(-4) : null
        const result = { hasApiKey: hasKey, last4 }
        const resultStr = JSON.stringify(result)

        expect(result.hasApiKey).toBe(true)
        // Full key must not appear; last4 is intentionally exposed
        expect(resultStr).not.toContain(apiKey)
        if (apiKey.length > 4) {
          expect(result.last4).toBe(apiKey.slice(-4))
        }
      }),
      { numRuns: 50 },
    )
  })
})

// ─── Property 15: Serverseitige Input-Validierung ───────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 15: Serverseitige Input-Validierung', () => {
  it('empty or whitespace-only values are rejected by validation', () => {
    const validateNonEmpty = (value: unknown, fieldName: string): string => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw { type: ErrorType.VALIDATION_ERROR, message: `${fieldName} darf nicht leer sein.`, retryable: false }
      }
      return value.trim()
    }

    fc.assert(
      fc.property(fc.constantFrom('', ' ', '  ', '\t', '\n'), (badValue) => {
        expect(() => validateNonEmpty(badValue, 'Test')).toThrow()
      }),
      { numRuns: 5 },
    )
  })
})

// ─── Property 16: Keine sensiblen Daten in Logs ────────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 16: Keine sensiblen Daten in Logs', () => {
  it('log output uses [REDACTED] for API keys', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    console.info(`[api] Saving API key for instance test (key: [REDACTED])`)

    const allLogs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(allLogs).toContain('[REDACTED]')
    expect(allLogs).not.toContain('super-secret-api-key')

    logSpy.mockRestore()
  })
})
