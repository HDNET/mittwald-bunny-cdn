import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createLogger } from '~/server/logger.js'
import * as schema from './schema.js'

const log = createLogger('db')

let db: ReturnType<typeof createDb> | null = null
let sqlite: InstanceType<typeof Database> | null = null

function createDb() {
  const dbPath = process.env.DATABASE_URL ?? './data/sqlite.db'

  // Ensure directory exists
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  sqlite = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL')
  // Enforce foreign key constraints
  sqlite.pragma('foreign_keys = ON')
  // synchronous=NORMAL: WAL is durable across process crashes; we only lose
  // a tail of writes on a power-loss event. The volume backup mittwald takes
  // is consistent in either mode (SQLite is crash-recoverable from snapshots).
  sqlite.pragma('synchronous = NORMAL')
  // busy_timeout: SQLite returns SQLITE_BUSY immediately on lock contention
  // by default. With WAL there's only one writer, but a checkpoint can briefly
  // block. 5s is well above the worst-case checkpoint pause and far below any
  // user-visible request budget.
  sqlite.pragma('busy_timeout = 5000')

  const database = drizzle(sqlite, { schema })

  // Fail-fast: if migrations cannot be applied, the process must not
  // serve requests against a stale schema. Exit with non-zero so the
  // container orchestrator restarts us (and the operator sees the error).
  try {
    migrate(database, { migrationsFolder: './drizzle' })
    log.info('[db] Migrations applied successfully')
  } catch (error) {
    log.error('[db] Migration failed — refusing to start:', error)
    process.exit(1)
  }

  return database
}

export function getDb() {
  if (!db) {
    db = createDb()
  }
  return db
}

/**
 * Connectivity check used by the `/api/health` liveness probe.
 *
 * Uses the raw better-sqlite3 prepare/get path rather than the Drizzle
 * query builder because Drizzle's `db.get(rawSqlString)` is not a valid
 * surface — Drizzle's `.get()` lives on a `select(...).from(...)` chain
 * or behind a `sql\`...\`` template. We don't need a query builder for a
 * trivial `SELECT 1`; the underlying driver is the right level of detail.
 *
 * Returns `true` only when the query executed and returned the expected
 * row. Any thrown error (DB locked, disk gone, native module crashed)
 * collapses to `false` so the caller can flip the probe to 503.
 */
export function pingDb(): boolean {
  try {
    if (!db) db = createDb()
    if (!sqlite) return false
    const row = sqlite.prepare('SELECT 1 AS ok').get() as { ok?: number } | undefined
    return row?.ok === 1
  } catch (e) {
    log.warn('Database ping failed', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Graceful shutdown: checkpoint WAL so the on-disk DB file is consistent
 * for mittwald's filesystem-level volume backup, then close the connection.
 */
export function closeDb(): void {
  if (sqlite) {
    try {
      sqlite.pragma('wal_checkpoint(TRUNCATE)')
      sqlite.close()
      log.info('[db] Database closed cleanly')
    } catch (e) {
      log.error('[db] Error during shutdown:', e)
    }
    sqlite = null
    db = null
  }
}

// SIGTERM: container orchestrator asks us to stop. Checkpoint WAL and
// close DB so the next backup captures a consistent state.
process.on('SIGTERM', () => {
  log.info('[process] SIGTERM received — shutting down')
  closeDb()
  process.exit(0)
})

process.on('SIGINT', () => {
  log.info('[process] SIGINT received — shutting down')
  closeDb()
  process.exit(0)
})

export type AppDatabase = ReturnType<typeof getDb>
