/**
 * In-memory TTL cache for BunnyCDN statistics. Keyed by pull zone id.
 *
 * Rationale: every dashboard mount would otherwise fire three BunnyCDN
 * API calls (current stats, previous-month stats, billing). Stats rarely
 * change on a per-second basis, so a short TTL is safe and cuts load.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const store = new Map<number, CacheEntry<unknown>>()

const DEFAULT_TTL_MS = 60_000
const SWEEP_INTERVAL_MS = 5 * 60_000

// Periodic sweep of expired entries. Without this, keys that are written but
// never read again would linger in memory for the lifetime of the process.
// `unref()` so the interval never holds the Node event loop open on its own.
// Skipped in test runs where we use fake timers and don't want a real interval.
if (process.env.NODE_ENV !== 'test' && typeof setInterval !== 'undefined') {
  const handle = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key)
    }
  }, SWEEP_INTERVAL_MS)
  handle.unref?.()
}

export function getCached<T>(key: number): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    store.delete(key)
    return null
  }
  return entry.value as T
}

export function setCached<T>(key: number, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function invalidateCached(key: number): void {
  store.delete(key)
}

/** For tests only. */
export function clearAllCached(): void {
  store.clear()
}
