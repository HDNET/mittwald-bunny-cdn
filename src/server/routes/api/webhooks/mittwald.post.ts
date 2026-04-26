import { defineEventHandler, getHeaders, readRawBody, setResponseStatus } from 'nitro/h3'
import { getEnvironmentVariables } from '~/env'
import { getDb } from '~/server/db/index'
import { createLogger } from '~/server/logger.js'
import { markProcessed, startWebhookDedupSweeper, wasProcessed } from '~/server/webhooks/dedup'
import {
  handleExtensionAdded,
  handleInstanceRemoved,
  handleInstanceUpdated,
  handleSecretRotated,
} from '~/server/webhooks/handler'
import { createWebhookVerifier, verifyWebhookOrReject } from '~/server/webhooks/signature'
import {
  extensionAddedToContextKind,
  instanceRemovedKind,
  instanceUpdatedKind,
  secretRotatedKind,
  webhookSchema,
} from '~/server/webhooks/types'

const log = createLogger('webhook')

// Singleton verifier so the public-key cache (CachingPublicKeyProvider inside
// `createWebhookVerifier`) is shared across all incoming webhooks. Building a
// fresh instance per request would force a marketplace public-key API hit on
// every webhook — an unauthenticated attacker spamming random Signature-Serials
// could turn `/webhooks/mittwald` into an amplification primitive against the
// upstream key endpoint.
const verifier = createWebhookVerifier()

export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event)) ?? ''
  const headers = getHeaders(event)

  const rejection = await verifyWebhookOrReject(rawBody, headers, verifier)
  if (rejection) return rejection

  let rawJson: unknown
  try {
    rawJson = JSON.parse(rawBody)
  } catch {
    setResponseStatus(event, 400)
    return { error: 'Malformed JSON body' }
  }

  // Validate against the mitthooks-canonical schema so that shape + kind
  // string drift is impossible. A wrong-shape or wrong-kind payload is
  // caught here with a 400 instead of silently hitting the `default`
  // switch branch.
  const parseResult = webhookSchema.safeParse(rawJson)
  if (!parseResult.success) {
    log.warn('[webhook] Rejected malformed payload:', parseResult.error.message)
    setResponseStatus(event, 400)
    return { error: 'Invalid webhook payload shape' }
  }
  const payload = parseResult.data

  // Guard against forward-replay attacks: a valid mittwald signature
  // proves the webhook was issued by mittwald, but not that it was
  // issued for *this* extension. Check that the extensionId in the
  // meta block matches our own — otherwise a signed webhook from any
  // other mittwald extension could be redirected here and processed.
  // See https://developer.mittwald.de/docs/v2/contribution/reference/webhooks#meta
  const env = getEnvironmentVariables()
  if (payload.meta.extensionId !== env.EXTENSION_ID) {
    log.warn(`Rejected webhook for extensionId=${payload.meta.extensionId} (expected ${env.EXTENSION_ID})`)
    setResponseStatus(event, 400)
    return { error: 'Webhook not intended for this extension' }
  }

  // Defence in depth on top of the dedup sweep: a signed payload older than
  // mittwald's actual retry horizon should never be accepted. mittwald retries
  // within hours, not weeks — 7d is generous and shrinks the dedup table well
  // below the previous 30d retention.
  const requestCreatedAtMs = Date.parse(payload.request.createdAt)
  const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
  if (!Number.isFinite(requestCreatedAtMs) || Date.now() - requestCreatedAtMs > REPLAY_WINDOW_MS) {
    log.warn(
      `Rejected webhook: request.createdAt=${payload.request.createdAt} outside ${REPLAY_WINDOW_MS / 86_400_000}d replay window (id=${payload.request.id})`,
    )
    setResponseStatus(event, 400)
    return { error: 'Webhook timestamp outside replay window' }
  }

  log.info(`Received: ${payload.kind} (id: ${payload.id}, requestId: ${payload.request.id})`)

  try {
    const db = getDb()
    startWebhookDedupSweeper(db)

    // Replay guard: mittwald delivers at-least-once but never reuses
    // request.id. If we've already processed this one, return 200 without
    // re-running the handler. See
    // https://developer.mittwald.de/docs/v2/contribution/reference/webhooks#request
    if (wasProcessed(db, payload.request.id)) {
      log.info(`Duplicate request.id ${payload.request.id} — already processed`)
      return { success: true, deduplicated: true }
    }

    switch (payload.kind) {
      case extensionAddedToContextKind:
        await handleExtensionAdded(db, payload)
        markProcessed(db, payload.request.id)
        return { success: true }

      case instanceUpdatedKind:
        await handleInstanceUpdated(db, payload)
        markProcessed(db, payload.request.id)
        return { success: true }

      case secretRotatedKind:
        await handleSecretRotated(db, payload)
        markProcessed(db, payload.request.id)
        return { success: true }

      case instanceRemovedKind: {
        const result = await handleInstanceRemoved(db, payload)
        markProcessed(db, payload.request.id)
        return {
          success: true,
          bunnyDeleted: result.bunnyDeleted,
          warning:
            result.hadPullZone && !result.bunnyDeleted
              ? 'Pull zone could not be deleted at bunny.net — manual cleanup required.'
              : undefined,
        }
      }

      default: {
        // Discriminated union is exhaustive — this branch is reachable only
        // if mitthooks introduces a new kind we don't handle yet.
        const _never: never = payload
        setResponseStatus(event, 400)
        return { error: `Unhandled webhook kind: ${(_never as { kind: string }).kind}` }
      }
    }
  } catch (e) {
    log.error(`Handler failed for ${payload.kind}:`, e instanceof Error ? e.message : e)
    setResponseStatus(event, 500)
    return { error: 'Webhook processing failed' }
  }
})
