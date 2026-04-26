import {
  Alert,
  AlertText,
  Button,
  Content,
  Flex,
  LayoutCard,
  SkeletonText,
} from '@mittwald/flow-remote-react-components'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'
import { DashboardShell } from '~/components/dashboard/DashboardShell'
import { WizardShell } from '~/components/wizard/WizardShell'
import { BunnyCdnGhost } from '~/ghosts'
import { localizeError } from '~/lib/localize-error'

export const Route = createFileRoute('/')({
  component: App,
  ssr: false,
})

function App() {
  const { t } = useTranslation()
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <LayoutCard>
          <Alert status="danger" role="alert">
            <AlertText>{localizeError(error, t)}</AlertText>
          </Alert>
          <Content>
            <Button onPress={resetErrorBoundary}>{t('common.errors.retry')}</Button>
          </Content>
        </LayoutCard>
      )}
    >
      <Suspense
        fallback={
          <LayoutCard>
            <SkeletonText />
          </LayoutCard>
        }
      >
        <AppContent />
      </Suspense>
    </ErrorBoundary>
  )
}

function AppContent() {
  const { t } = useTranslation()
  const { value: apiKeyStatus, invalidate: invalidateApiKey } = BunnyCdnGhost.getApiKeyStatus().useGhost()
  const { value: pullZoneStatus, invalidate: invalidatePullZone } = BunnyCdnGhost.getPullZoneStatus().useGhost()

  const invalidateAll = () => {
    void invalidateApiKey()
    void invalidatePullZone()
  }

  const extensionPaused = pullZoneStatus?.extensionEnabled === false
  const main = pullZoneStatus?.exists ? (
    <DashboardShell onStateChange={invalidateAll} />
  ) : apiKeyStatus?.hasApiKey ? (
    <WizardShell initialStep={1} onComplete={invalidateAll} />
  ) : (
    <WizardShell initialStep={0} onComplete={invalidateAll} />
  )

  if (!extensionPaused) return main

  return (
    <Flex direction="column" gap="m">
      <LayoutCard>
        <Alert status="warning">
          <AlertText>{t('app.extensionPaused')}</AlertText>
        </Alert>
      </LayoutCard>
      {main}
    </Flex>
  )
}
