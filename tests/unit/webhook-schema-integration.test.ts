import {
  extensionAddedToContextKind,
  extensionAddedToContextWebhookSchema,
  instanceRemovedKind,
  instanceRemovedWebhookSchema,
  instanceUpdatedKind,
  instanceUpdatedWebhookSchema,
  secretRotatedKind,
  secretRotatedWebhookSchema,
  webhookSchema,
} from '@weissaufschwarz/mitthooks/schemas.js'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  handleExtensionAdded,
  handleInstanceRemoved,
  handleInstanceUpdated,
  handleSecretRotated,
} from '~/server/webhooks/handler.js'
import { createTestDb } from '../helpers/db.js'

/**
 * Integration check against the mitthooks-canonical zod schemas.
 *
 * If mitthooks ever renames a kind string or adds a new event, this
 * suite fails immediately — which is the whole point. Before this
 * existed, the handler was typed by hand with the wrong kind string
 * for 5+ months and every test passed because the tests used the
 * same wrong string. Sourcing both the handler and the tests from
 * mitthooks directly makes that class of drift mechanically
 * impossible.
 */

function baseEnvelope(id: string) {
  return {
    apiVersion: 'v2',
    id,
    context: { id: 'ctx-1', kind: 'project' as const },
    meta: { extensionId: 'ext-1', contributorId: 'contrib-1' },
    request: {
      id: 'req-1',
      createdAt: new Date().toISOString(),
      target: { method: 'POST' as const, url: 'https://example.test/webhook' },
    },
  }
}

describe('mitthooks kind constants', () => {
  it('are the exact wire strings we rely on', () => {
    // Canary: if any of these ever change upstream, our handler's
    // switch cases — which import the same constants — still match,
    // but this test records what mittwald's wire format was expected
    // to be at the time of writing.
    expect(extensionAddedToContextKind).toBe('ExtensionAddedToContext')
    expect(instanceUpdatedKind).toBe('InstanceUpdated')
    expect(secretRotatedKind).toBe('SecretRotated')
    expect(instanceRemovedKind).toBe('InstanceRemovedFromContext')
  })
})

describe('webhookSchema discriminates every kind we handle', () => {
  it('parses an ExtensionAddedToContext payload', () => {
    const payload = {
      ...baseEnvelope('evt-add'),
      kind: extensionAddedToContextKind,
      secret: 'shh',
      consentedScopes: ['domain:read'],
      state: { enabled: true },
    }
    const parsed = webhookSchema.parse(payload)
    expect(parsed.kind).toBe('ExtensionAddedToContext')
  })

  it('parses an InstanceUpdated payload', () => {
    const payload = {
      ...baseEnvelope('evt-upd'),
      kind: instanceUpdatedKind,
      consentedScopes: ['domain:read', 'domain:write'],
      state: { enabled: true },
    }
    expect(webhookSchema.parse(payload).kind).toBe('InstanceUpdated')
  })

  it('parses a SecretRotated payload', () => {
    const payload = { ...baseEnvelope('evt-rot'), kind: secretRotatedKind, secret: 'new-shh' }
    expect(webhookSchema.parse(payload).kind).toBe('SecretRotated')
  })

  it('parses an InstanceRemovedFromContext payload', () => {
    const payload = {
      ...baseEnvelope('evt-rem'),
      kind: instanceRemovedKind,
      consentedScopes: [],
      state: { enabled: true },
    }
    expect(webhookSchema.parse(payload).kind).toBe('InstanceRemovedFromContext')
  })

  it('rejects an unknown kind', () => {
    const payload = { ...baseEnvelope('evt-???'), kind: 'SomethingElse' }
    expect(webhookSchema.safeParse(payload).success).toBe(false)
  })
})

describe('handlers accept the mitthooks-parsed payloads end-to-end', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('handleExtensionAdded persists an instance from a mitthooks-shaped payload', async () => {
    const payload = extensionAddedToContextWebhookSchema.parse({
      ...baseEnvelope('inst-1'),
      kind: extensionAddedToContextKind,
      secret: 'shh',
      consentedScopes: ['domain:read'],
      state: { enabled: true },
    })
    await handleExtensionAdded(db, payload)
    const stored = db.$client.prepare('SELECT * FROM extension_instances WHERE id = ?').get('inst-1') as
      | { id: string; consented_scopes: string }
      | undefined
    expect(stored?.id).toBe('inst-1')
    expect(JSON.parse(stored?.consented_scopes ?? '[]')).toEqual(['domain:read'])
  })

  it('handleInstanceUpdated rewrites consented scopes', async () => {
    const added = extensionAddedToContextWebhookSchema.parse({
      ...baseEnvelope('inst-2'),
      kind: extensionAddedToContextKind,
      secret: 'shh',
      consentedScopes: ['domain:read'],
      state: { enabled: true },
    })
    await handleExtensionAdded(db, added)

    const updated = instanceUpdatedWebhookSchema.parse({
      ...baseEnvelope('inst-2'),
      kind: instanceUpdatedKind,
      consentedScopes: ['domain:read', 'domain:write'],
      state: { enabled: true },
    })
    await handleInstanceUpdated(db, updated)

    const stored = db.$client.prepare('SELECT consented_scopes FROM extension_instances WHERE id = ?').get('inst-2') as
      | { consented_scopes: string }
      | undefined
    expect(JSON.parse(stored?.consented_scopes ?? '[]')).toEqual(['domain:read', 'domain:write'])
  })

  it('handleSecretRotated is a no-op (per-instance secret intentionally not persisted)', async () => {
    const added = extensionAddedToContextWebhookSchema.parse({
      ...baseEnvelope('inst-3'),
      kind: extensionAddedToContextKind,
      secret: 'old',
      consentedScopes: [],
      state: { enabled: true },
    })
    await handleExtensionAdded(db, added)
    const before = db.$client.prepare('SELECT updated_at FROM extension_instances WHERE id = ?').get('inst-3') as
      | { updated_at: number }
      | undefined

    const rotated = secretRotatedWebhookSchema.parse({
      ...baseEnvelope('inst-3'),
      kind: secretRotatedKind,
      secret: 'new',
    })
    await handleSecretRotated(db, rotated)

    const after = db.$client.prepare('SELECT updated_at FROM extension_instances WHERE id = ?').get('inst-3') as
      | { updated_at: number }
      | undefined
    expect(after?.updated_at).toBe(before?.updated_at)
  })

  it('handleInstanceRemoved deletes the instance row', async () => {
    const added = extensionAddedToContextWebhookSchema.parse({
      ...baseEnvelope('inst-4'),
      kind: extensionAddedToContextKind,
      secret: 'shh',
      consentedScopes: [],
      state: { enabled: true },
    })
    await handleExtensionAdded(db, added)

    const removed = instanceRemovedWebhookSchema.parse({
      ...baseEnvelope('inst-4'),
      kind: instanceRemovedKind,
      consentedScopes: [],
      state: { enabled: true },
    })
    const result = await handleInstanceRemoved(db, removed)

    expect(result.hadPullZone).toBe(false)
    const stored = db.$client.prepare('SELECT id FROM extension_instances WHERE id = ?').get('inst-4')
    expect(stored).toBeUndefined()
  })
})
