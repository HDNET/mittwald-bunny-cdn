import { eq } from 'drizzle-orm'
import fc from 'fast-check'
import { beforeEach, describe, expect, it } from 'vitest'
import { extensionInstances, pullZones } from '~/server/db/schema.js'
import { createTestDb } from '../helpers/db.js'

/**
 * Property 7: Pull Zone Daten werden korrekt persistiert
 *
 * Für jede erfolgreiche Pull-Zone-Erstellung muss die Datenbank die Pull Zone ID,
 * CDN Domain und den gewählten CDN-Modus korrekt für die zugehörige Instance ID speichern.
 *
 * **Validates: Requirements 6.5**
 */

// Generators
const instanceIdArb = fc.uuid()
// fast-check v4 removed both `hexaString` and `hexa()` shortcuts. Build the
// hex unit ourselves with constantFrom — works on v3 and v4.
const HEX_CHARS = '0123456789abcdef'.split('') as ['0', ...string[]]
const secretArb = fc.string({
  unit: fc.constantFrom(...HEX_CHARS),
  minLength: 32,
  maxLength: 64,
})
const contextIdArb = fc.uuid()
const pullZoneIdArb = fc.integer({ min: 1, max: 2_147_483_647 })
const cdnDomainArb = fc.tuple(fc.stringMatching(/^[a-z0-9]{3,20}$/)).map(([sub]) => `${sub}.b-cdn.net`)
const originUrlArb = fc.domain().map((d) => `https://${d}`)
const cdnModeArb = fc.constantFrom('asset' as const, 'full-site' as const)

describe('Feature: mittwald-bunny-cdn, Property 7: Pull Zone Daten werden korrekt persistiert', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('should persist pull zone ID, CDN domain, and CDN mode correctly for the associated instance ID', () => {
    /**
     * **Validates: Requirements 6.5**
     */
    fc.assert(
      fc.property(
        instanceIdArb,
        secretArb,
        contextIdArb,
        pullZoneIdArb,
        cdnDomainArb,
        originUrlArb,
        cdnModeArb,
        (instanceId, _secret, contextId, pullZoneId, cdnDomain, originUrl, cdnMode) => {
          // Clean up from previous iteration
          db.delete(pullZones).run()
          db.delete(extensionInstances).run()

          const now = new Date()

          // 1. Insert extension instance (foreign key requirement)
          db.insert(extensionInstances)
            .values({
              id: instanceId,
              contextId,
              consentedScopes: JSON.stringify(['domain:read', 'domain:write']),
              createdAt: now,
              updatedAt: now,
            })
            .run()

          // 2. Insert pull zone with generated data
          db.insert(pullZones)
            .values({
              id: pullZoneId,
              instanceId,
              cdnDomain,
              originUrl,
              cdnMode,
              createdAt: now,
            })
            .run()

          // 3. Read back and verify all fields match
          const stored = db.select().from(pullZones).where(eq(pullZones.instanceId, instanceId)).get()

          expect(stored).toBeDefined()
          expect(stored?.id).toBe(pullZoneId)
          expect(stored?.instanceId).toBe(instanceId)
          expect(stored?.cdnDomain).toBe(cdnDomain)
          expect(stored?.originUrl).toBe(originUrl)
          expect(stored?.cdnMode).toBe(cdnMode)
        },
      ),
      { numRuns: 100 },
    )
  })
})
