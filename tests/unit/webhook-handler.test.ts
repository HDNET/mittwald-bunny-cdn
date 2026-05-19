import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extensionInstances, pullZones } from '~/server/db/schema.js'
import {
  handleExtensionAdded,
  handleInstanceRemoved,
  handleInstanceUpdated,
  handleSecretRotated,
} from '~/server/webhooks/handler.js'
import { createTestDb } from '../helpers/db.js'

vi.mock('~/server/bunnycdn.js', () => ({
  deletePullZone: vi.fn().mockResolvedValue(undefined),
}))

// `decrypt` needs the encryption env vars set when imported by handler.ts.
process.env.ENCRYPTION_MASTER_PASSWORD = process.env.ENCRYPTION_MASTER_PASSWORD || 'test-password'
process.env.ENCRYPTION_SALT = process.env.ENCRYPTION_SALT || 'test-salt'

describe('handleExtensionAdded', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('should insert a new extension instance with correct fields', async () => {
    await handleExtensionAdded(db, {
      id: 'inst-001',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'project-42', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 's3cret',
      consentedScopes: [],
      state: { enabled: true },
    })

    const rows = db.select().from(extensionInstances).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('inst-001')
    expect(rows[0].contextId).toBe('project-42')
    expect(rows[0].encryptedApiKey).toBeNull()
  })

  it('should set createdAt and updatedAt timestamps', async () => {
    // SQLite integer timestamps have second-level precision, so we compare at that granularity
    const beforeSec = Math.floor(Date.now() / 1000)
    await handleExtensionAdded(db, {
      id: 'inst-002',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'secret',
      consentedScopes: [],
      state: { enabled: true },
    })
    const afterSec = Math.ceil(Date.now() / 1000)

    const row = db.select().from(extensionInstances).all()[0]
    const createdSec = Math.floor(row.createdAt.getTime() / 1000)
    const updatedSec = Math.floor(row.updatedAt.getTime() / 1000)
    expect(createdSec).toBeGreaterThanOrEqual(beforeSec)
    expect(createdSec).toBeLessThanOrEqual(afterSec)
    expect(updatedSec).toBeGreaterThanOrEqual(beforeSec)
    expect(updatedSec).toBeLessThanOrEqual(afterSec)
  })

  it('should persist state.enabled=false when mittwald reports the instance as paused', async () => {
    await handleExtensionAdded(db, {
      id: 'inst-paused',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'secret',
      consentedScopes: [],
      state: { enabled: false },
    })

    const row = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-paused')).all()[0]
    expect(row.enabled).toBe(false)
  })

  it('should upsert on duplicate instance IDs (idempotent redelivery)', async () => {
    await handleExtensionAdded(db, {
      id: 'dup-id',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'a',
      consentedScopes: [],
      state: { enabled: true },
    })

    // Redelivery with updated data — should not throw, should update
    await handleExtensionAdded(db, {
      id: 'dup-id',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx2', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'b',
      consentedScopes: [],
      state: { enabled: true },
    })

    const row = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'dup-id')).get()
    expect(row).toBeDefined()
    expect(row?.contextId).toBe('ctx2')
  })
})

describe('handleInstanceUpdated', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(async () => {
    db = createTestDb()
    await handleExtensionAdded(db, {
      id: 'inst-upd',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 's',
      consentedScopes: ['domain:read'],
      state: { enabled: true },
    })
  })

  it('should flip enabled to false when mittwald pauses the instance', async () => {
    await handleInstanceUpdated(db, {
      id: 'inst-upd',
      kind: 'InstanceUpdated',
      apiVersion: 'v1',
      request: { id: 'req-2', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: ['domain:read'],
      state: { enabled: false },
    })

    const row = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-upd')).all()[0]
    expect(row.enabled).toBe(false)
  })

  it('should flip enabled back to true when the instance is re-enabled', async () => {
    db.update(extensionInstances).set({ enabled: false }).where(eq(extensionInstances.id, 'inst-upd')).run()

    await handleInstanceUpdated(db, {
      id: 'inst-upd',
      kind: 'InstanceUpdated',
      apiVersion: 'v1',
      request: { id: 'req-3', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: ['domain:read'],
      state: { enabled: true },
    })

    const row = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-upd')).all()[0]
    expect(row.enabled).toBe(true)
  })

  it('should rewrite consented scopes on update', async () => {
    await handleInstanceUpdated(db, {
      id: 'inst-upd',
      kind: 'InstanceUpdated',
      apiVersion: 'v1',
      request: { id: 'req-4', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: ['domain:read', 'domain:write'],
      state: { enabled: true },
    })

    const row = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-upd')).all()[0]
    expect(JSON.parse(row.consentedScopes)).toEqual(['domain:read', 'domain:write'])
  })
})

describe('handleSecretRotated', () => {
  // The per-instance secret is intentionally not persisted (signature
  // verification uses the marketplace public-key path). The handler is a
  // pure ack — these tests pin that contract: the row stays untouched and
  // the call must not throw on missing instances.
  let db: ReturnType<typeof createTestDb>

  beforeEach(async () => {
    db = createTestDb()
    await handleExtensionAdded(db, {
      id: 'inst-rot',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'old-secret',
      consentedScopes: [],
      state: { enabled: true },
    })
  })

  it('should not modify the row (secret intentionally not persisted)', async () => {
    const before = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-rot')).get()

    await handleSecretRotated(db, {
      id: 'inst-rot',
      kind: 'SecretRotated',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'new-secret',
    })

    const after = db.select().from(extensionInstances).where(eq(extensionInstances.id, 'inst-rot')).get()
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime())
  })

  it('should be a no-op for non-existent instance', async () => {
    await handleSecretRotated(db, {
      id: 'non-existent',
      kind: 'SecretRotated',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'whatever',
    })

    const rows = db.select().from(extensionInstances).all()
    expect(rows).toHaveLength(1)
  })
})

describe('handleInstanceRemoved', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(async () => {
    db = createTestDb()
    await handleExtensionAdded(db, {
      id: 'inst-del',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'secret',
      consentedScopes: [],
      state: { enabled: true },
    })
  })

  it('should delete the extension instance', async () => {
    await handleInstanceRemoved(db, {
      id: 'inst-del',
      kind: 'InstanceRemovedFromContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: [],
      state: { enabled: true },
    })

    const rows = db.select().from(extensionInstances).all()
    expect(rows).toHaveLength(0)
  })

  it('should cascade-delete associated pull zones', async () => {
    // Insert a pull zone linked to the instance
    db.insert(pullZones)
      .values({
        id: 12345,
        instanceId: 'inst-del',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        createdAt: new Date(),
      })
      .run()

    await handleInstanceRemoved(db, {
      id: 'inst-del',
      kind: 'InstanceRemovedFromContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: [],
      state: { enabled: true },
    })

    const instanceRows = db.select().from(extensionInstances).all()
    const pullZoneRows = db.select().from(pullZones).all()
    expect(instanceRows).toHaveLength(0)
    expect(pullZoneRows).toHaveLength(0)
  })

  it('should not affect other instances', async () => {
    await handleExtensionAdded(db, {
      id: 'inst-keep',
      kind: 'ExtensionAddedToContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx2', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      secret: 'keep-me',
      consentedScopes: [],
      state: { enabled: true },
    })

    await handleInstanceRemoved(db, {
      id: 'inst-del',
      kind: 'InstanceRemovedFromContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: [],
      state: { enabled: true },
    })

    const rows = db.select().from(extensionInstances).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('inst-keep')
  })

  it('should be a no-op for non-existent instance', async () => {
    await handleInstanceRemoved(db, {
      id: 'ghost',
      kind: 'InstanceRemovedFromContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: [],
      state: { enabled: true },
    })

    const rows = db.select().from(extensionInstances).all()
    expect(rows).toHaveLength(1)
  })

  it('best-effort deletes the bunny zone when an API key is present', async () => {
    const { encrypt } = await import('~/server/crypto.js')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-del'))
      .run()
    db.insert(pullZones)
      .values({
        id: 555,
        instanceId: 'inst-del',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn.js')
    vi.mocked(bunny.deletePullZone).mockClear()

    const result = await handleInstanceRemoved(db, {
      id: 'inst-del',
      kind: 'InstanceRemovedFromContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: [],
      state: { enabled: true },
    })

    expect(bunny.deletePullZone).toHaveBeenCalledWith(555, 'test-key')
    expect(result).toEqual({ hadPullZone: true, bunnyDeleted: true })
  })

  it('swallows bunny.deletePullZone failures (does not block instance removal)', async () => {
    const { encrypt } = await import('~/server/crypto.js')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-del'))
      .run()
    db.insert(pullZones)
      .values({
        id: 666,
        instanceId: 'inst-del',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn.js')
    vi.mocked(bunny.deletePullZone).mockRejectedValueOnce(new Error('bunny 503'))

    const result = await handleInstanceRemoved(db, {
      id: 'inst-del',
      kind: 'InstanceRemovedFromContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: [],
      state: { enabled: true },
    })

    expect(result).toEqual({ hadPullZone: true, bunnyDeleted: false })
    // Instance row still removed despite bunny failure
    expect(db.select().from(extensionInstances).all()).toHaveLength(0)
  })

  it('logs and skips bunny call when pull zone exists but no API key is stored', async () => {
    db.insert(pullZones)
      .values({
        id: 777,
        instanceId: 'inst-del',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn.js')
    vi.mocked(bunny.deletePullZone).mockClear()

    const result = await handleInstanceRemoved(db, {
      id: 'inst-del',
      kind: 'InstanceRemovedFromContext',
      apiVersion: 'v1',
      request: { id: 'req-1', createdAt: '2026-01-01T00:00:00Z', target: { method: 'POST', url: 'http://test' } },
      context: { id: 'ctx', kind: 'project' },
      meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
      consentedScopes: [],
      state: { enabled: true },
    })

    expect(bunny.deletePullZone).not.toHaveBeenCalled()
    expect(result).toEqual({ hadPullZone: true, bunnyDeleted: false })
  })
})
