import { eq } from 'drizzle-orm'
import type { AppDatabase } from '~/server/db/index'
import { getDb } from '~/server/db/index'
import { extensionInstances } from '~/server/db/schema'
import { createAppError, ErrorType } from '~/shared/errors'

/**
 * Defence-in-depth tenant check: verify the JWT's `contextId` claim matches
 * the contextId stored against the JWT's `extensionInstanceId`. mStudio binds
 * those at install time so a mismatch should be impossible — but if it ever
 * is, every downstream `requireProjectRole` / DNS-API call would target the
 * token's contextId against an instance that belongs to a different project.
 *
 * Returns silently when no instance row exists yet (race vs. webhook install)
 * — downstream `requireScope`/`requireEnabled` will produce the correct
 * INSTANCE_NOT_FOUND error.
 */
export function assertInstanceContextMatches(extensionInstanceId: string, contextId: string): void {
  const row = getDb()
    .select({ contextId: extensionInstances.contextId })
    .from(extensionInstances)
    .where(eq(extensionInstances.id, extensionInstanceId))
    .get()
  if (!row) return
  if (row.contextId !== contextId) {
    throw createAppError(ErrorType.AUTH_ERROR, 'Session-Token gehört nicht zur erwarteten Projekt-Instanz.', {
      retryable: false,
      code: 'CONTEXT_MISMATCH',
    })
  }
}

function parseConsentedScopes(raw: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((x): x is string => typeof x === 'string')
}

export function requireScope(db: AppDatabase, instanceId: string, scope: string): void {
  const instance = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()

  if (!instance) {
    throw createAppError(ErrorType.AUTH_ERROR, 'Extension-Instanz nicht gefunden.', {
      retryable: false,
      code: 'INSTANCE_NOT_FOUND',
    })
  }

  const scopes = parseConsentedScopes(instance.consentedScopes)
  if (!scopes.includes(scope)) {
    throw createAppError(
      ErrorType.AUTH_ERROR,
      `Berechtigung "${scope}" fehlt. Bitte die Extension in mStudio erneut autorisieren.`,
      { retryable: false, code: 'MISSING_SCOPE', variables: { scope } },
    )
  }
}

/**
 * Blocks mutations when the extension instance is paused in mStudio.
 * mittwald sets `state.enabled = false` via webhook when the user deactivates
 * the instance; per mittwald docs the extension must then stop "functioning"
 * until it is re-enabled. Reads are left alone so the UI can still surface
 * the paused state; only write-path server functions call this.
 * @see https://developer.mittwald.de/docs/v2/contribution/reference/webhooks
 */
export function requireEnabled(db: AppDatabase, instanceId: string): void {
  const instance = db.select().from(extensionInstances).where(eq(extensionInstances.id, instanceId)).get()

  if (!instance) {
    throw createAppError(ErrorType.AUTH_ERROR, 'Extension-Instanz nicht gefunden.', {
      retryable: false,
      code: 'INSTANCE_NOT_FOUND',
    })
  }

  if (!instance.enabled) {
    throw createAppError(
      ErrorType.VALIDATION_ERROR,
      'Die Extension ist in mStudio pausiert. Bitte zuerst in mStudio reaktivieren.',
      { retryable: false, code: 'INSTANCE_PAUSED' },
    )
  }
}
