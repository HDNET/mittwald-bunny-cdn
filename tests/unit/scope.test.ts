import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { extensionInstances } from '~/server/db/schema.js'
import { requireEnabled, requireInstanceExists, requireScope } from '~/server/scope.js'
import { isAppError } from '~/shared/errors.js'
import { createTestDb, seedInstance } from '../helpers/db.js'

describe('requireScope', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedInstance(db, 'inst-1', 'ctx', ['domain:read'])
  })

  it('passes when the requested scope is consented', () => {
    expect(() => requireScope(db, 'inst-1', 'domain:read')).not.toThrow()
  })

  it('throws an AUTH_ERROR when the scope is missing', () => {
    try {
      requireScope(db, 'inst-1', 'domain:write')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('AUTH_ERROR')
    }
  })

  it('throws an AUTH_ERROR when the instance does not exist', () => {
    try {
      requireScope(db, 'missing', 'domain:read')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('AUTH_ERROR')
    }
  })

  it('treats invalid consentedScopes JSON as an empty scope set (fails closed)', () => {
    db.update(extensionInstances).set({ consentedScopes: 'not-json' }).where(eq(extensionInstances.id, 'inst-1')).run()

    try {
      requireScope(db, 'inst-1', 'domain:read')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('MISSING_SCOPE')
    }
  })

  it('ignores non-string entries inside consentedScopes', () => {
    db.update(extensionInstances)
      .set({ consentedScopes: JSON.stringify(['domain:read', 42, null, 'domain:write']) })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    // Strings pass through, non-strings are dropped — domain:write is still granted.
    expect(() => requireScope(db, 'inst-1', 'domain:read')).not.toThrow()
    expect(() => requireScope(db, 'inst-1', 'domain:write')).not.toThrow()
  })

  it('treats a non-array consentedScopes payload as empty', () => {
    db.update(extensionInstances)
      .set({ consentedScopes: '{"not":"an-array"}' })
      .where(eq(extensionInstances.id, 'inst-1'))
      .run()

    try {
      requireScope(db, 'inst-1', 'domain:read')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('MISSING_SCOPE')
    }
  })
})

describe('requireEnabled', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedInstance(db, 'inst-on')
  })

  it('passes when the instance is enabled', () => {
    expect(() => requireEnabled(db, 'inst-on')).not.toThrow()
  })

  it('throws a VALIDATION_ERROR when the instance is paused in mStudio', () => {
    db.update(extensionInstances).set({ enabled: false }).where(eq(extensionInstances.id, 'inst-on')).run()

    try {
      requireEnabled(db, 'inst-on')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('VALIDATION_ERROR')
      expect(isAppError(e) && e.message).toMatch(/pausiert/)
    }
  })

  it('throws an AUTH_ERROR when the instance does not exist', () => {
    try {
      requireEnabled(db, 'ghost')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('AUTH_ERROR')
    }
  })
})

describe('requireInstanceExists', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedInstance(db, 'inst-r')
  })

  it('returns the instance row when present', () => {
    const row = requireInstanceExists(db, 'inst-r')
    expect(row.id).toBe('inst-r')
    expect(row.enabled).toBe(true)
  })

  it('returns the row even when the instance is paused (reads must still work)', () => {
    db.update(extensionInstances).set({ enabled: false }).where(eq(extensionInstances.id, 'inst-r')).run()
    const row = requireInstanceExists(db, 'inst-r')
    expect(row.enabled).toBe(false)
  })

  it('throws AUTH_ERROR with INSTANCE_NOT_FOUND when the instance does not exist', () => {
    try {
      requireInstanceExists(db, 'ghost')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('AUTH_ERROR')
      expect(isAppError(e) && e.code).toBe('INSTANCE_NOT_FOUND')
    }
  })
})
