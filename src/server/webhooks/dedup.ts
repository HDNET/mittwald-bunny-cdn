import { eq, lt } from 'drizzle-orm'
import type { AppDatabase } from '~/server/db/index'
import { processedWebhookRequests } from '~/server/db/schema'
import { createLogger } from '~/server/logger.js'

const log = createLogger('webhook')

// Retention must be strictly greater than the 7d replay-window enforced in
// `mittwald.post.ts` so a captured payload cannot land in the boundary gap
// (dedup pruned, timestamp still accepted). 14d is a comfortable margin.
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Tracks mittwald webhook `request.id` values so we can reject duplicate
 * deliveries. mittwald executes webhooks at-least-once and never reuses a
 * request.id, so the presence of an id in this table proves we've already
 * processed it.
 *
 * The table is append-only during normal operation; a background interval
 * prunes entries older than RETENTION_MS so it doesn't grow unbounded.
 */

/** Returns true if this request.id was seen before. */
export function wasProcessed(db: AppDatabase, requestId: string): boolean {
  const row = db
    .select({ id: processedWebhookRequests.id })
    .from(processedWebhookRequests)
    .where(eq(processedWebhookRequests.id, requestId))
    .get()
  return !!row
}

/** Records the request.id as processed. */
export function markProcessed(db: AppDatabase, requestId: string): void {
  db.insert(processedWebhookRequests).values({ id: requestId, processedAt: new Date() }).onConflictDoNothing().run()
}

/** For tests. */
export function pruneOlderThan(db: AppDatabase, cutoff: Date): number {
  const result = db.delete(processedWebhookRequests).where(lt(processedWebhookRequests.processedAt, cutoff)).run()
  return result.changes
}

let sweepHandle: ReturnType<typeof setInterval> | null = null

/**
 * Install a periodic sweeper that deletes request.id entries older than
 * RETENTION_MS. Safe to call multiple times — subsequent calls are no-ops.
 * Skipped under NODE_ENV=test so fake timers in unit tests aren't disturbed.
 */
export function startWebhookDedupSweeper(db: AppDatabase): void {
  if (sweepHandle) return
  if (process.env.NODE_ENV === 'test') return
  if (typeof setInterval === 'undefined') return

  sweepHandle = setInterval(() => {
    const cutoff = new Date(Date.now() - RETENTION_MS)
    try {
      const removed = pruneOlderThan(db, cutoff)
      if (removed > 0) {
        log.info(`Dedup sweep removed ${removed} stale request.id entries`)
      }
    } catch (e) {
      log.warn('[webhook] Dedup sweep failed:', e instanceof Error ? e.message : e)
    }
  }, SWEEP_INTERVAL_MS)
  sweepHandle.unref?.()
}
