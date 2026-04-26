import { eq } from 'drizzle-orm'
import * as bunny from '~/server/bunnycdn.js'
import { decrypt } from '~/server/crypto.js'
import type { AppDatabase } from '~/server/db/index.js'
import { extensionInstances, pullZones } from '~/server/db/schema.js'
import { createLogger } from '~/server/logger.js'
import type {
  ExtensionAddedPayload,
  InstanceRemovedPayload,
  InstanceUpdatedPayload,
  SecretRotatedPayload,
} from './types.js'

const log = createLogger('webhook')

/**
 * Idempotent: uses onConflictDoUpdate so a redelivered webhook
 * (crash between handler + markProcessed) overwrites with the same
 * data instead of throwing a PK conflict → no retry loop.
 *
 * Note: `payload.secret` is intentionally discarded — we don't use the
 * per-instance secret (signature verification goes through the marketplace
 * Ed25519 public-key path).
 */
export async function handleExtensionAdded(db: AppDatabase, payload: ExtensionAddedPayload): Promise<void> {
  const now = new Date()
  await db
    .insert(extensionInstances)
    .values({
      id: payload.id,
      contextId: payload.context.id,
      consentedScopes: JSON.stringify(payload.consentedScopes),
      enabled: payload.state.enabled,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: extensionInstances.id,
      set: {
        contextId: payload.context.id,
        consentedScopes: JSON.stringify(payload.consentedScopes),
        enabled: payload.state.enabled,
        updatedAt: now,
      },
    })
}

/** Idempotent: UPDATE on non-existent row is a no-op. */
export async function handleInstanceUpdated(db: AppDatabase, payload: InstanceUpdatedPayload): Promise<void> {
  await db
    .update(extensionInstances)
    .set({
      consentedScopes: JSON.stringify(payload.consentedScopes),
      enabled: payload.state.enabled,
      updatedAt: new Date(),
    })
    .where(eq(extensionInstances.id, payload.id))
}

/**
 * No-op: we don't persist per-instance secrets (see `handleExtensionAdded`).
 * Acknowledging the webhook prevents mittwald from retrying.
 */
export async function handleSecretRotated(_db: AppDatabase, payload: SecretRotatedPayload): Promise<void> {
  log.info(`SecretRotated for ${payload.id} — ignored (per-instance secret not used).`)
}

/**
 * Best-effort cleanup: attempts to delete the pull zone at bunny.net
 * before removing local data. Failures are logged but do not block
 * the instance removal — the user can still delete the zone manually
 * via the bunny.net dashboard.
 *
 * Idempotent: DELETE on non-existent row is a no-op.
 *
 * Known limitation (#61): the mittwald CNAME (e.g. `cdn.example.com →
 * xyz.b-cdn.net`) is *not* cleaned up. Doing so would require user-scoped
 * mittwald API credentials which the webhook handler does not have (the
 * webhook fires on uninstall, after the user is gone, and our deploy-time
 * `MITTWALD_API_TOKEN` cannot write to a customer's DNS zone). After we
 * delete the bunny.net pull zone the orphaned CNAME points at NXDOMAIN —
 * cosmetically annoying but functionally harmless. Document in the user-
 * facing uninstall flow if this becomes a support-ticket driver.
 */
export async function handleInstanceRemoved(
  db: AppDatabase,
  payload: InstanceRemovedPayload,
): Promise<{ hadPullZone: boolean; bunnyDeleted: boolean }> {
  const instance = db.select().from(extensionInstances).where(eq(extensionInstances.id, payload.id)).get()
  const pullZone = db.select().from(pullZones).where(eq(pullZones.instanceId, payload.id)).get()

  let bunnyDeleted = false

  if (pullZone && instance?.encryptedApiKey) {
    try {
      const apiKey = decrypt(instance.encryptedApiKey)
      await bunny.deletePullZone(pullZone.id, apiKey)
      bunnyDeleted = true
      log.info(`Best-effort deleted pull zone ${pullZone.id} at bunny.net`)
    } catch (e) {
      log.warn(
        `Best-effort pull zone deletion failed for ${pullZone.id} — zone may still exist at bunny.net:`,
        e instanceof Error ? e.message : e,
      )
    }
  } else if (pullZone) {
    log.warn(
      `Instance ${payload.id} removed but pull zone ${pullZone.id} (${pullZone.cdnDomain}) has no API key — cannot delete at bunny.net.`,
    )
  }

  await db.delete(extensionInstances).where(eq(extensionInstances.id, payload.id))
  return { hadPullZone: !!pullZone, bunnyDeleted }
}
