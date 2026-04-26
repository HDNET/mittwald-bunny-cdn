import { Alert, AlertText, LayoutCard } from '@mittwald/flow-remote-react-components'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'
import { BunnyCdnGhost } from '~/ghosts'

/**
 * Proactively queries the caller's project membership role and shows a
 * warning if the role isn't in the write-path allowlist. Silent when the
 * role is fine or when the membership query fails — in the failure case
 * the real createPullZone call will still surface an error.
 *
 * mittwald recommends validating required permissions up front:
 * https://developer.mittwald.de/docs/v2/contribution/how-to/ensure-authorization
 */
export function PermissionBanner() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <PermissionBannerContent />
      </Suspense>
    </ErrorBoundary>
  )
}

function PermissionBannerContent() {
  const { t } = useTranslation()
  const perm = BunnyCdnGhost.checkPermissions().use()
  if (!perm || perm.allowed) return null
  // Suppress when the role couldn't be resolved (typically because the
  // extension hasn't been granted `project:read`). The downstream mittwald
  // write call will enforce permissions itself, so we'd rather show no banner
  // than a scary "contact admin" warning to a user who is in fact owner.
  if (!perm.role) return null

  return (
    <LayoutCard>
      <Alert status="warning">
        <AlertText>{t('wizard.permissionBanner.withRole', { role: perm.role })}</AlertText>
      </Alert>
    </LayoutCard>
  )
}
