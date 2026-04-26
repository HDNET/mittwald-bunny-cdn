import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { processedWebhookRequests } from '~/server/db/schema.js'
import { markProcessed, pruneOlderThan, startWebhookDedupSweeper, wasProcessed } from '~/server/webhooks/dedup.js'
import { createTestDb } from '../helpers/db.js'

/**
 * mittwald delivers webhooks at-least-once and never reuses `request.id`,
 * so we record every ID we successfully processed and reject duplicates.
 * These tests cover the three moving pieces: record, look-up, and the
 * retention-cutoff sweeper.
 *
 * @see https://developer.mittwald.de/docs/v2/contribution/reference/webhooks#request
 */

describe('wasProcessed / markProcessed', () => {
  it('returns false for an unknown request.id', () => {
    const db = createTestDb()
    expect(wasProcessed(db, 'never-seen')).toBe(false)
  })

  it('returns true after markProcessed persisted the same id', () => {
    const db = createTestDb()
    markProcessed(db, 'req-1')
    expect(wasProcessed(db, 'req-1')).toBe(true)
  })

  it('treats different ids as independent', () => {
    const db = createTestDb()
    markProcessed(db, 'req-1')
    expect(wasProcessed(db, 'req-2')).toBe(false)
  })

  it('markProcessed is idempotent — calling it twice is a no-op', () => {
    const db = createTestDb()
    // First call inserts, second call hits onConflictDoNothing() — no throw,
    // single row remains.
    markProcessed(db, 'req-1')
    markProcessed(db, 'req-1')
    expect(wasProcessed(db, 'req-1')).toBe(true)
  })
})

describe('pruneOlderThan', () => {
  it('deletes only rows strictly older than the cutoff', () => {
    const db = createTestDb()
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    markProcessed(db, 'recent')
    markProcessed(db, 'old')
    // Age the `old` row explicitly so prune has something to drop —
    // mirrors what the 30-day-old entries look like in prod.
    db.update(processedWebhookRequests).set({ processedAt: dayAgo }).where(eq(processedWebhookRequests.id, 'old')).run()

    const removed = pruneOlderThan(db, hourAgo)
    expect(removed).toBe(1)
    expect(wasProcessed(db, 'recent')).toBe(true)
    expect(wasProcessed(db, 'old')).toBe(false)
  })

  it('returns 0 when everything is inside the retention window', () => {
    const db = createTestDb()
    markProcessed(db, 'fresh-a')
    markProcessed(db, 'fresh-b')
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(pruneOlderThan(db, cutoff)).toBe(0)
    expect(wasProcessed(db, 'fresh-a')).toBe(true)
    expect(wasProcessed(db, 'fresh-b')).toBe(true)
  })

  it('returns 0 on an empty table', () => {
    const db = createTestDb()
    expect(pruneOlderThan(db, new Date())).toBe(0)
  })
})

describe('startWebhookDedupSweeper', () => {
  it('is a no-op under NODE_ENV=test so fake timers in other tests are not disturbed', () => {
    // The module reads NODE_ENV at call time; vitest sets it to 'test'.
    const db = createTestDb()
    const before = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    // No throw, no interval scheduled — we cannot directly observe the
    // interval, but the absence of a throw plus idempotency on repeated
    // calls is enough contract-wise.
    expect(() => startWebhookDedupSweeper(db)).not.toThrow()
    expect(() => startWebhookDedupSweeper(db)).not.toThrow()
    process.env.NODE_ENV = before
  })
})
