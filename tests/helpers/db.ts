import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '~/server/db/schema.js'

export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })

  db.run(sql`
    CREATE TABLE extension_instances (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL,
      consented_scopes TEXT NOT NULL,
      encrypted_api_key TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.run(sql`
    CREATE TABLE pull_zones (
      id INTEGER PRIMARY KEY,
      instance_id TEXT NOT NULL UNIQUE REFERENCES extension_instances(id) ON DELETE CASCADE,
      cdn_domain TEXT NOT NULL,
      origin_url TEXT NOT NULL,
      cdn_mode TEXT NOT NULL CHECK(cdn_mode IN ('asset', 'full-site')),
      custom_hostname TEXT,
      created_at INTEGER NOT NULL
    )
  `)
  db.run(sql`
    CREATE TABLE processed_webhook_requests (
      id TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL
    )
  `)

  return db
}

export type TestDb = ReturnType<typeof createTestDb>

export function seedInstance(
  db: TestDb,
  id = 'inst-1',
  contextId = 'project-1',
  consentedScopes: string[] = ['domain:read', 'domain:write'],
) {
  const { extensionInstances } = schema
  db.insert(extensionInstances)
    .values({
      id,
      contextId,
      consentedScopes: JSON.stringify(consentedScopes),
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()
}
