import type { MittwaldAPIV2Client } from '@mittwald/api-client'
import { createLogger } from '~/server/logger.js'
import { createAppError, ErrorType } from '~/shared/errors'

const log = createLogger('membership')

export type ProjectRole = 'notset' | 'owner' | 'emailadmin' | 'external'

/**
 * Default allowlist for write-path mittwald API calls the extension makes
 * (DNS zone + CNAME record creation during pull-zone setup). Only `owner`
 * has full project-level write permissions. `emailadmin` is restricted to
 * mailbox management; `external` is a custom role whose actual permission
 * set is opaque to us; `notset` is a placeholder.
 *
 * This is a pre-check for UX — the mittwald API still enforces on its side
 * when the real request goes out, so widening this list only affects which
 * users hit the friendly in-extension warning versus a raw 403 from mStudio.
 *
 * @see https://developer.mittwald.de/docs/v2/contribution/how-to/ensure-authorization
 */
export const DEFAULT_WRITE_ROLE_ALLOWLIST: readonly ProjectRole[] = ['owner']

export interface ProjectMembershipCheck {
  /** Role returned from mittwald; `null` if no membership was found (user is not a project member). */
  role: ProjectRole | null
  /** `true` if the role is in the configured allowlist. */
  allowed: boolean
}

/**
 * Looks up the *calling user's own* membership role for the given project.
 * Returns `{ role: null, allowed: false }` when mittwald answers with 403/404
 * (no membership or not allowed to read membership), so callers get a
 * truthy, non-throwing signal they can turn into a warning banner.
 */
export async function getProjectRole(
  client: MittwaldAPIV2Client,
  projectId: string,
  allowlist: readonly ProjectRole[] = DEFAULT_WRITE_ROLE_ALLOWLIST,
): Promise<ProjectMembershipCheck> {
  try {
    const res = await client.project.getSelfMembershipForProject({ projectId })
    if (res.status !== 200) {
      return { role: null, allowed: false }
    }
    const role = res.data.role as ProjectRole
    return { role, allowed: allowlist.includes(role) }
  } catch (e) {
    log.warn('[membership] getSelfMembershipForProject failed:', e instanceof Error ? e.message : e)
    return { role: null, allowed: false }
  }
}

/**
 * Throws a friendly AppError when the calling user's project role is not in
 * `allowlist`. Call this from mutation server functions that hit mittwald
 * write endpoints, so the user sees "Administrator kontaktieren" instead of
 * a cryptic 403 from the mStudio API a few calls later.
 */
export async function requireProjectRole(
  client: MittwaldAPIV2Client,
  projectId: string,
  allowlist: readonly ProjectRole[] = DEFAULT_WRITE_ROLE_ALLOWLIST,
): Promise<void> {
  const { role, allowed } = await getProjectRole(client, projectId, allowlist)
  if (allowed) return

  if (role) {
    // Known role, not in allowlist — block with a clear message.
    throw createAppError(
      ErrorType.AUTH_ERROR,
      `Für diese Aktion werden Projekt-Owner-Rechte benötigt. Bitte kontaktiere eine:n Administrator:in des Projekts. Deine aktuelle Rolle: "${role}".`,
      { retryable: false, code: 'MISSING_OWNER_ROLE', variables: { role } },
    )
  }

  // role === null: membership API returned 403/404, likely because the
  // extension lacks `project:read` scope. Let the user through — the
  // downstream mittwald API will enforce permissions on the actual write
  // call. This avoids blocking legitimate owners when we simply can't
  // read their role.
  log.warn('Could not determine project role — proceeding optimistically', { projectId })
}
