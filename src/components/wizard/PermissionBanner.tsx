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

  const message = perm.role
    ? t('wizard.permissionBanner.withRole', { role: perm.role })
    : t('wizard.permissionBanner.unknownRole')
  return (
    <LayoutCard>
      <Alert status="warning">
        <AlertText>{message}</AlertText>
      </Alert>
    </LayoutCard>
  )
}
