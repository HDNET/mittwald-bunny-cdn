import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { extensionInstances } from '~/server/db/schema.js'
import { requireEnabled, requireScope } from '~/server/scope.js'
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
