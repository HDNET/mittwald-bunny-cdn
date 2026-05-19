import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCustomHostname, createPullZone, removeCustomHostname } from '~/domain/pull-zone'
import { extensionInstances, pullZones } from '~/server/db/schema'
import { createTestDb, seedInstance } from '../helpers/db'

vi.mock('~/server/bunnycdn.js', () => ({
  createPullZone: vi.fn().mockResolvedValue({ id: 42, name: 'test', cdnDomain: 'test.b-cdn.net', adopted: false }),
  setupFullSiteCdn: vi.fn().mockResolvedValue(undefined),
  setEuOnly: vi.fn().mockResolvedValue(undefined),
  setEuMode: vi.fn().mockResolvedValue(undefined),
  addHostname: vi.fn().mockResolvedValue(undefined),
  removeHostname: vi.fn().mockResolvedValue(undefined),
  enableFreeSsl: vi.fn().mockResolvedValue(undefined),
  deletePullZone: vi.fn().mockResolvedValue(undefined),
}))

process.env.ENCRYPTION_MASTER_PASSWORD = 'test-password'
process.env.ENCRYPTION_SALT = 'test-salt'

describe('domain/createPullZone', () => {
  it('creates pull zone and persists to DB', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    const result = await createPullZone(db, 'inst-1', 'project-1', {
      name: 'testzone',
      originUrl: 'https://example.com',
      cdnMode: 'asset',
    })

    expect(result.id).toBe(42)
    expect(result.cdnDomain).toBe('test.b-cdn.net')
    expect(result.dnsConfigured).toBe(false)

    const stored = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).get()
    expect(stored).toBeDefined()
    expect(stored?.id).toBe(42)
    expect(stored?.cdnDomain).toBe('test.b-cdn.net')
    expect(stored?.cdnMode).toBe('asset')
  })

  it('throws when no API key is stored', async () => {
    const db = createTestDb()
    seedInstance(db)

    await expect(
      createPullZone(db, 'inst-1', 'project-1', {
        name: 'test',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
      }),
    ).rejects.toMatchObject({ type: 'VALIDATION_ERROR' })
  })

  it('auto-creates DNS CNAME when dnsClient is provided', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    const dnsClient = {
      listZones: vi.fn().mockResolvedValue([{ id: 'zone-1', domain: 'example.com' }]),
      createZone: vi.fn().mockResolvedValue({ id: 'zone-cdn' }),
      setCname: vi.fn().mockResolvedValue(true),
    }

    const result = await createPullZone(
      db,
      'inst-1',
      'project-1',
      {
        name: 'testzone',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        domain: 'example.com',
      },
      dnsClient,
    )

    expect(result.dnsConfigured).toBe(true)
    expect(dnsClient.listZones).toHaveBeenCalledWith('project-1')
    expect(dnsClient.createZone).toHaveBeenCalledWith('cdn', 'zone-1')
    expect(dnsClient.setCname).toHaveBeenCalledWith('zone-cdn', 'test.b-cdn.net')
  })

  it('DNS failure does not fail pull zone creation', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    const dnsClient = {
      listZones: vi.fn().mockRejectedValue(new Error('DNS API down')),
      createZone: vi.fn(),
      setCname: vi.fn(),
    }

    const result = await createPullZone(
      db,
      'inst-1',
      'project-1',
      {
        name: 'testzone',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        domain: 'example.com',
      },
      dnsClient,
    )

    // Pull zone still created despite DNS failure
    expect(result.id).toBe(42)
    expect(result.dnsConfigured).toBe(false)
  })

  it('full-site mode calls setupFullSiteCdn', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    const bunny = await import('~/server/bunnycdn')

    await createPullZone(db, 'inst-1', 'project-1', {
      name: 'testzone',
      originUrl: 'https://example.com',
      cdnMode: 'full-site',
      hostname: 'www.example.com',
    })

    expect(bunny.setupFullSiteCdn).toHaveBeenCalledWith(42, 'www.example.com', expect.any(String))
  })
})

describe('domain/createPullZone rollback on failure', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  async function seedWithApiKey() {
    const db = createTestDb()
    seedInstance(db)
    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()
    return db
  }

  it('rolls back bunny zone when setEuMode fails', async () => {
    const db = await seedWithApiKey()
    const bunny = await import('~/server/bunnycdn')
    vi.mocked(bunny.createPullZone).mockResolvedValueOnce({
      id: 42,
      name: 'test',
      cdnDomain: 'test.b-cdn.net',
      adopted: false,
    })
    vi.mocked(bunny.setEuMode).mockRejectedValueOnce(new Error('bunny 500'))

    await expect(
      createPullZone(db, 'inst-1', 'project-1', {
        name: 'testzone',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        euOnly: true,
        customHostnameEnabled: false,
      }),
    ).rejects.toThrow('bunny 500')

    expect(bunny.deletePullZone).toHaveBeenCalledWith(42, expect.any(String))
    expect(db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).get()).toBeUndefined()
  })

  it('rolls back when addHostname fails', async () => {
    const db = await seedWithApiKey()
    const bunny = await import('~/server/bunnycdn')
    vi.mocked(bunny.createPullZone).mockResolvedValueOnce({
      id: 42,
      name: 'test',
      cdnDomain: 'test.b-cdn.net',
      adopted: false,
    })
    vi.mocked(bunny.addHostname).mockRejectedValueOnce(new Error('hostname conflict'))

    await expect(
      createPullZone(db, 'inst-1', 'project-1', {
        name: 'testzone',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        domain: 'example.com',
      }),
    ).rejects.toThrow('hostname conflict')

    expect(bunny.deletePullZone).toHaveBeenCalledWith(42, expect.any(String))
  })

  it('does NOT roll back when zone was adopted (pre-existed at bunny)', async () => {
    const db = await seedWithApiKey()
    const bunny = await import('~/server/bunnycdn')
    vi.mocked(bunny.createPullZone).mockResolvedValueOnce({
      id: 42,
      name: 'test',
      cdnDomain: 'test.b-cdn.net',
      adopted: true,
    })
    vi.mocked(bunny.setEuMode).mockRejectedValueOnce(new Error('bunny 500'))

    await expect(
      createPullZone(db, 'inst-1', 'project-1', {
        name: 'testzone',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        euOnly: true,
        customHostnameEnabled: false,
      }),
    ).rejects.toThrow('bunny 500')

    expect(bunny.deletePullZone).not.toHaveBeenCalled()
  })

  it('cleanup failure does not mask the original error', async () => {
    const db = await seedWithApiKey()
    const bunny = await import('~/server/bunnycdn')
    vi.mocked(bunny.createPullZone).mockResolvedValueOnce({
      id: 42,
      name: 'test',
      cdnDomain: 'test.b-cdn.net',
      adopted: false,
    })
    vi.mocked(bunny.setEuMode).mockRejectedValueOnce(new Error('original failure'))
    vi.mocked(bunny.deletePullZone).mockRejectedValueOnce(new Error('cleanup also failed'))

    await expect(
      createPullZone(db, 'inst-1', 'project-1', {
        name: 'testzone',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        euOnly: true,
        customHostnameEnabled: false,
      }),
    ).rejects.toThrow('original failure')

    expect(bunny.deletePullZone).toHaveBeenCalledWith(42, expect.any(String))
  })
})

describe('domain/createPullZone custom hostname toggle', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('asset + customHostnameEnabled defaulting true registers bunny hostname + SSL', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    const bunny = await import('~/server/bunnycdn')

    const result = await createPullZone(db, 'inst-1', 'project-1', {
      name: 'testzone',
      originUrl: 'https://example.com',
      cdnMode: 'asset',
      domain: 'example.com',
    })

    expect(bunny.addHostname).toHaveBeenCalledWith(42, 'cdn.example.com', expect.any(String))
    expect(bunny.enableFreeSsl).toHaveBeenCalledWith(42, 'cdn.example.com', expect.any(String))
    expect(result.customHostname).toBe('cdn.example.com')

    const row = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).get()
    expect(row?.customHostname).toBe('cdn.example.com')
  })

  it('asset + customHostnameEnabled=false skips bunny hostname, SSL, and DNS', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    const bunny = await import('~/server/bunnycdn')
    const dnsClient = {
      listZones: vi.fn(),
      createZone: vi.fn(),
      setCname: vi.fn(),
    }

    const result = await createPullZone(
      db,
      'inst-1',
      'project-1',
      {
        name: 'testzone',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        domain: 'example.com',
        customHostnameEnabled: false,
      },
      dnsClient,
    )

    expect(bunny.addHostname).not.toHaveBeenCalled()
    expect(bunny.enableFreeSsl).not.toHaveBeenCalled()
    expect(dnsClient.listZones).not.toHaveBeenCalled()
    expect(result.customHostname).toBeNull()
    expect(result.dnsConfigured).toBe(false)

    const row = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).get()
    expect(row?.customHostname).toBeNull()
  })
})

describe('domain/addCustomHostname', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('registers hostname, enables SSL, configures DNS, and persists', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    // Seed an existing asset-mode pull zone with NO custom hostname yet.
    db.insert(pullZones)
      .values({
        id: 99,
        instanceId: 'inst-1',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        customHostname: null,
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn')
    const dnsClient = {
      listZones: vi.fn().mockResolvedValue([{ id: 'zone-1', domain: 'example.com' }]),
      createZone: vi.fn().mockResolvedValue({ id: 'zone-cdn' }),
      setCname: vi.fn().mockResolvedValue(true),
    }

    const result = await addCustomHostname(db, 'inst-1', 'project-1', 'example.com', dnsClient)

    expect(bunny.addHostname).toHaveBeenCalledWith(99, 'cdn.example.com', expect.any(String))
    expect(bunny.enableFreeSsl).toHaveBeenCalledWith(99, 'cdn.example.com', expect.any(String))
    expect(result).toEqual({ customHostname: 'cdn.example.com', dnsConfigured: true })

    const row = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).get()
    expect(row?.customHostname).toBe('cdn.example.com')
  })

  it('refuses to run on full-site pull zones', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    db.insert(pullZones)
      .values({
        id: 100,
        instanceId: 'inst-1',
        cdnDomain: 'fs.b-cdn.net',
        originUrl: 'https://mittwald-intern.example',
        cdnMode: 'full-site',
        customHostname: 'www.example.com',
        createdAt: new Date(),
      })
      .run()

    await expect(addCustomHostname(db, 'inst-1', 'project-1', 'example.com')).rejects.toMatchObject({
      type: 'VALIDATION_ERROR',
    })
  })

  it('rolls back addHostname when enableFreeSsl fails', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    db.insert(pullZones)
      .values({
        id: 99,
        instanceId: 'inst-1',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        customHostname: null,
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn')
    vi.mocked(bunny.enableFreeSsl).mockRejectedValueOnce(new Error('ssl provisioning failed'))

    await expect(addCustomHostname(db, 'inst-1', 'project-1', 'example.com')).rejects.toThrow('ssl provisioning failed')

    expect(bunny.addHostname).toHaveBeenCalledWith(99, 'cdn.example.com', expect.any(String))
    expect(bunny.removeHostname).toHaveBeenCalledWith(99, 'cdn.example.com', expect.any(String))
    const row = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).get()
    expect(row?.customHostname).toBeNull()
  })

  it('is a no-op when the pull zone already has a custom hostname', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    db.insert(pullZones)
      .values({
        id: 101,
        instanceId: 'inst-1',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        customHostname: 'cdn.example.com',
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn')
    const result = await addCustomHostname(db, 'inst-1', 'project-1', 'example.com')

    expect(bunny.addHostname).not.toHaveBeenCalled()
    expect(result.customHostname).toBe('cdn.example.com')
  })
})

describe('domain/removeCustomHostname', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('unregisters hostname at bunny, clears CNAME, and nulls DB field', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    db.insert(pullZones)
      .values({
        id: 200,
        instanceId: 'inst-1',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        customHostname: 'cdn.example.com',
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn')
    const dnsClient = {
      listZones: vi.fn().mockResolvedValue([
        { id: 'zone-1', domain: 'example.com' },
        { id: 'zone-cdn', domain: 'cdn.example.com' },
      ]),
      createZone: vi.fn(),
      setCname: vi.fn(),
      clearCname: vi.fn().mockResolvedValue(true),
    }

    const result = await removeCustomHostname(db, 'inst-1', 'project-1', dnsClient)

    expect(bunny.removeHostname).toHaveBeenCalledWith(200, 'cdn.example.com', expect.any(String))
    expect(dnsClient.clearCname).toHaveBeenCalledWith('zone-cdn')
    expect(result.dnsCleared).toBe(true)

    const row = db.select().from(pullZones).where(eq(pullZones.instanceId, 'inst-1')).get()
    expect(row?.customHostname).toBeNull()
  })

  it('is a no-op when no custom hostname is set', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    db.insert(pullZones)
      .values({
        id: 201,
        instanceId: 'inst-1',
        cdnDomain: 'xyz.b-cdn.net',
        originUrl: 'https://example.com',
        cdnMode: 'asset',
        customHostname: null,
        createdAt: new Date(),
      })
      .run()

    const bunny = await import('~/server/bunnycdn')
    const result = await removeCustomHostname(db, 'inst-1', 'project-1')

    expect(bunny.removeHostname).not.toHaveBeenCalled()
    expect(result.dnsCleared).toBe(false)
  })

  it('refuses to run on full-site pull zones', async () => {
    const db = createTestDb()
    seedInstance(db)

    const { encrypt } = await import('~/server/crypto')
    db.update(extensionInstances)
      .set({ encryptedApiKey: encrypt('test-key') })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    db.insert(pullZones)
      .values({
        id: 202,
        instanceId: 'inst-1',
        cdnDomain: 'fs.b-cdn.net',
        originUrl: 'https://mittwald-intern.example',
        cdnMode: 'full-site',
        customHostname: 'www.example.com',
        createdAt: new Date(),
      })
      .run()

    await expect(removeCustomHostname(db, 'inst-1', 'project-1')).rejects.toMatchObject({
      type: 'VALIDATION_ERROR',
    })
  })
})
