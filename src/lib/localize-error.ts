import type { TFunction } from 'i18next'
import { isAppError } from '~/shared/errors'

/**
 * Client-side helper: take whatever a server function threw and turn it
 * into a user-facing, localized string.
 *
 * Priority order:
 * 1. `AppError.code` → look up `errors.<code>` in the active locale;
 *    fall back to `AppError.message` if the key is missing.
 * 2. `AppError.message` or raw `Error.message` → show verbatim. Server
 *    functions written before the code-based flow existed still work.
 * 3. Unknown throwable → stringify.
 *
 * Use inside React components:
 *   const { t } = useTranslation()
 *   const msg = localizeError(error, t)
 */
export function localizeError(error: unknown, t: TFunction): string {
  if (isAppError(error)) {
    if (error.code) {
      const variables = { ...(error.variables ?? {}) }
      // The `MISSING_OWNER_ROLE` error carries the raw mittwald role string
      // (`owner`/`emailadmin`/`external`/`notset`). Translate it before
      // interpolation so the user sees a localized label, not an API value.
      if (error.code === 'MISSING_OWNER_ROLE' && typeof variables.role === 'string') {
        variables.role = t(`roles.${variables.role}`, { defaultValue: variables.role })
      }
      return t(`errors.${error.code}`, { defaultValue: error.message, ...variables })
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}
