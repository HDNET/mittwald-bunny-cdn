import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCached, getCached, invalidateCached, setCached } from '~/server/stats-cache.js'

beforeEach(() => {
  clearAllCached()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('stats-cache', () => {
  it('returns null for unknown key', () => {
    expect(getCached(42)).toBeNull()
  })

  it('returns cached value within TTL', () => {
    setCached(42, { bandwidth: 123 })
    expect(getCached(42)).toEqual({ bandwidth: 123 })
  })

  it('returns null after default TTL (60s) expires', () => {
    setCached(42, { bandwidth: 123 })
    vi.advanceTimersByTime(61_000)
    expect(getCached(42)).toBeNull()
  })

  it('respects a custom TTL', () => {
    setCached(42, { bandwidth: 123 }, 5_000)
    vi.advanceTimersByTime(4_000)
    expect(getCached(42)).not.toBeNull()
    vi.advanceTimersByTime(2_000)
    expect(getCached(42)).toBeNull()
  })

  it('invalidateCached removes the entry immediately', () => {
    setCached(42, { bandwidth: 123 })
    invalidateCached(42)
    expect(getCached(42)).toBeNull()
  })

  it('keeps entries for other keys isolated', () => {
    setCached(1, { a: 1 })
    setCached(2, { b: 2 })
    invalidateCached(1)
    expect(getCached(1)).toBeNull()
    expect(getCached(2)).toEqual({ b: 2 })
  })

  it('evicts expired entries on access (cleanup on read)', () => {
    setCached(42, { bandwidth: 123 })
    vi.advanceTimersByTime(61_000)
    expect(getCached(42)).toBeNull()
    // Subsequent call still returns null (entry was evicted, not just hidden)
    expect(getCached(42)).toBeNull()
  })
})
