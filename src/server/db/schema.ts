import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Extension Instances — one per installation
//
// Note: the per-instance secret that mittwald delivers in `ExtensionAddedToContext`
// and `SecretRotated` webhooks is intentionally NOT persisted. Webhook signature
// verification uses the marketplace Ed25519 public-key path (see
// `src/server/webhooks/signature.ts`); the per-instance secret is unused, so
// storing the ciphertext would be a credential we have no use for.
export const extensionInstances = sqliteTable('extension_instances', {
  id: text('id').primaryKey(), // Extension Instance ID from mittwald
  contextId: text('context_id').notNull(), // mittwald project ID
  consentedScopes: text('consented_scopes').notNull(), // JSON array, e.g. '["domain:read","domain:write"]'
  encryptedApiKey: text('encrypted_api_key'), // AES-256-GCM ciphertext of the bunny.net API key
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true), // mStudio state.enabled
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Pull Zones — one per instance (1:1)
export const pullZones = sqliteTable('pull_zones', {
  id: integer('id').primaryKey(), // BunnyCDN Pull Zone ID
  instanceId: text('instance_id')
    .notNull()
    .unique()
    .references(() => extensionInstances.id, { onDelete: 'cascade' }),
  cdnDomain: text('cdn_domain').notNull(), // e.g. "xyz.b-cdn.net"
  originUrl: text('origin_url').notNull(), // mittwald domain
  cdnMode: text('cdn_mode', { enum: ['asset', 'full-site'] }).notNull(),
  // Custom hostname the user maps under their own domain (cdn.example.com in
  // asset mode, www.example.com in full-site mode). NULL when the user opted
  // out in asset mode and only uses the `.b-cdn.net` URL. Must be kept in sync
  // with bunny.net addHostname and the mittwald CNAME record;
  // `add/removeCustomHostnameFn` update all three atomically.
  customHostname: text('custom_hostname'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// Processed webhook request IDs — mittwald delivers webhooks at-least-once
// and never reuses request.id values. We record each one we successfully
// handled so retries are deduplicated.
//
// Retention: rows are swept after 30 days by the dedup sweeper (see
// `src/server/webhooks/dedup.ts`). Rows are intentionally NOT deleted
// when the parent extension instance is removed — late redeliveries of
// an InstanceRemoved webhook must still be deduplicated. The IDs are
// opaque UUIDs with no personal data, so retention is GDPR-neutral.
// See https://developer.mittwald.de/docs/v2/contribution/reference/webhooks#request
export const processedWebhookRequests = sqliteTable('processed_webhook_requests', {
  id: text('id').primaryKey(), // payload.request.id (UUID)
  processedAt: integer('processed_at', { mode: 'timestamp' }).notNull(),
})
