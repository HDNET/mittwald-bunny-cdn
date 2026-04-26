import type { WebhookVerifier } from '@weissaufschwarz/mitthooks/verification/verify.js'
import type { WebhookContent } from '@weissaufschwarz/mitthooks/webhook.js'
import { eq } from 'drizzle-orm'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { extensionInstances, pullZones } from '~/server/db/schema.js'
import { handleExtensionAdded, handleInstanceRemoved, handleSecretRotated } from '~/server/webhooks/handler.js'
import { extractWebhookContent, validateWebhookSignature, verifyWebhookOrReject } from '~/server/webhooks/signature.js'
import { createTestDb } from '../helpers/db.js'

/**
 * Property-Based Tests for Webhook Handler (Properties 1–4)
 *
 * **Validates: Requirements 1.1, 1.2, 1.4, 1.5, 1.6**
 */

const instanceIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}$/)
const nonEmptyString = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)
const secretArb = nonEmptyString
const contextIdArb = nonEmptyString

// ─── Property 1 ─────────────────────────────────────────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 1: Webhook-Verarbeitung speichert Instance-Daten korrekt', () => {
  it('for every valid ExtensionAddedToContext payload, instance ID and context ID are correctly stored in the database', async () => {
    /** **Validates: Requirements 1.1** */
    await fc.assert(
      fc.asyncProperty(instanceIdArb, secretArb, contextIdArb, async (instanceId, secret, contextId) => {
        const db = createTestDb()

        await handleExtensionAdded(db, {
          id: instanceId,
          kind: 'ExtensionAddedToContext' as const,
          apiVersion: 'v1',
          request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
          context: { id: contextId, kind: 'project' },
          meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
          secret,
          consentedScopes: [],
          state: { enabled: true },
        })

        const row = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()

        expect(row).toBeDefined()
        expect(row?.id).toBe(instanceId)
        expect(row?.contextId).toBe(contextId)
        expect(row?.createdAt).toBeInstanceOf(Date)
        expect(row?.updatedAt).toBeInstanceOf(Date)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 2 ─────────────────────────────────────────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 2: SecretRotated ist ein No-op', () => {
  it('for every existing instance, SecretRotated leaves the row untouched (per-instance secret intentionally not persisted)', async () => {
    /** **Validates: Requirements 1.2** */
    await fc.assert(
      fc.asyncProperty(
        instanceIdArb,
        secretArb,
        contextIdArb,
        secretArb,
        async (instanceId, oldSecret, contextId, newSecret) => {
          const db = createTestDb()

          await handleExtensionAdded(db, {
            id: instanceId,
            kind: 'ExtensionAddedToContext' as const,
            apiVersion: 'v1',
            request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
            context: { id: contextId, kind: 'project' },
            meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
            secret: oldSecret,
            consentedScopes: [],
            state: { enabled: true },
          })

          const before = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()

          await handleSecretRotated(db, {
            id: instanceId,
            kind: 'SecretRotated' as const,
            apiVersion: 'v1',
            request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
            context: { id: 'ctx', kind: 'project' },
            meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
            secret: newSecret,
          })

          const after = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()

          expect(after).toBeDefined()
          expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime())
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 3 ─────────────────────────────────────────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 3: Instance-Entfernung löscht alle Daten', () => {
  it('for every existing instance (without pull zone), after InstanceRemoved no data remains for that instance ID', async () => {
    /** **Validates: Requirements 1.4** */
    await fc.assert(
      fc.asyncProperty(instanceIdArb, secretArb, contextIdArb, async (instanceId, secret, contextId) => {
        const db = createTestDb()

        await handleExtensionAdded(db, {
          id: instanceId,
          kind: 'ExtensionAddedToContext' as const,
          apiVersion: 'v1',
          request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
          context: { id: contextId, kind: 'project' },
          meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
          secret,
          consentedScopes: [],
          state: { enabled: true },
        })

        await handleInstanceRemoved(db, {
          id: instanceId,
          kind: 'InstanceRemovedFromContext' as const,
          apiVersion: 'v1',
          request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
          context: { id: 'ctx', kind: 'project' },
          meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
          consentedScopes: [],
          state: { enabled: true },
        })

        const instanceRow = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()
        expect(instanceRow).toBeUndefined()

        const pullZoneRows = db.select().from(pullZones).where(eq(pullZones.instanceId, instanceId)).all()
        expect(pullZoneRows).toHaveLength(0)
      }),
      { numRuns: 100 },
    )
  })

  it('for every existing instance with a pull zone, after InstanceRemoved both instance and pull zone data are deleted', async () => {
    /** **Validates: Requirements 1.4** */
    await fc.assert(
      fc.asyncProperty(
        instanceIdArb,
        secretArb,
        contextIdArb,
        fc.integer({ min: 1, max: 999999 }),
        fc.constantFrom('asset' as const, 'full-site' as const),
        async (instanceId, secret, contextId, pullZoneId, cdnMode) => {
          const db = createTestDb()

          await handleExtensionAdded(db, {
            id: instanceId,
            kind: 'ExtensionAddedToContext' as const,
            apiVersion: 'v1',
            request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
            context: { id: contextId, kind: 'project' },
            meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
            secret,
            consentedScopes: [],
            state: { enabled: true },
          })

          db.insert(pullZones)
            .values({
              id: pullZoneId,
              instanceId,
              cdnDomain: 'test.b-cdn.net',
              originUrl: 'https://example.com',
              cdnMode,
              createdAt: new Date(),
            })
            .run()

          await handleInstanceRemoved(db, {
            id: instanceId,
            kind: 'InstanceRemovedFromContext' as const,
            apiVersion: 'v1',
            request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
            context: { id: 'ctx', kind: 'project' },
            meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
            consentedScopes: [],
            state: { enabled: true },
          })

          const instanceRow = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()
          expect(instanceRow).toBeUndefined()

          const pullZoneRows = db.select().from(pullZones).where(eq(pullZones.instanceId, instanceId)).all()
          expect(pullZoneRows).toHaveLength(0)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 4 ─────────────────────────────────────────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 4: Webhook-Signatur-Validierung', () => {
  it('for every payload+signature combination, validation returns true iff the signature was correctly computed', async () => {
    /** **Validates: Requirements 1.5, 1.6** */
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), fc.boolean(), async (rawBody, shouldBeValid) => {
        const mockVerifier = {
          verify: async (_content: WebhookContent) => shouldBeValid,
        } as unknown as WebhookVerifier

        const content = extractWebhookContent(rawBody, {
          'x-marketplace-signature-serial': 'serial-1',
          'x-marketplace-signature-algorithm': 'ed25519',
          'x-marketplace-signature': 'some-sig',
        })

        const result = await validateWebhookSignature(content, mockVerifier)
        expect(result).toBe(shouldBeValid)
      }),
      { numRuns: 100 },
    )
  })

  it('invalid signatures cause verifyWebhookOrReject to return HTTP 401', async () => {
    /** **Validates: Requirements 1.6** */
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (rawBody) => {
        const mockVerifier = {
          verify: async () => false,
        } as unknown as WebhookVerifier

        const headers = {
          'x-marketplace-signature-serial': 'serial-1',
          'x-marketplace-signature-algorithm': 'ed25519',
          'x-marketplace-signature': 'invalid-sig',
        }

        const response = await verifyWebhookOrReject(rawBody, headers, mockVerifier)

        expect(response).not.toBeNull()
        expect(response?.status).toBe(401)
      }),
      { numRuns: 100 },
    )
  })

  it('valid signatures cause verifyWebhookOrReject to return null (proceed)', async () => {
    /** **Validates: Requirements 1.5** */
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (rawBody) => {
        const mockVerifier = {
          verify: async () => true,
        } as unknown as WebhookVerifier

        const headers = {
          'x-marketplace-signature-serial': 'serial-1',
          'x-marketplace-signature-algorithm': 'ed25519',
          'x-marketplace-signature': 'valid-sig',
        }

        const response = await verifyWebhookOrReject(rawBody, headers, mockVerifier)

        expect(response).toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})
