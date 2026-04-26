import { ActionGroup, Alert, AlertText, Button, LayoutCard, SkeletonText } from '@mittwald/flow-remote-react-components'
import { type ReactNode, Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'
import { localizeError } from '~/lib/localize-error'

interface Props {
  children: ReactNode
  /** Optional custom fallback while loading. Defaults to a SkeletonText card. */
  loadingFallback?: ReactNode
  /**
   * Optional secondary action rendered next to the retry button. Use this
   * to let the user escape the failing boundary entirely — e.g. the wizard
   * drops them back to Step 0 when domain fetching fails so they can fix a
   * bad API key instead of retrying forever.
   */
  onReset?: () => void
  /** i18n key for the `onReset` button. Defaults to `common.actions.backToStart`. */
  resetLabelKey?: string
}

/**
 * Pairs a Suspense boundary with an ErrorBoundary so a throwing data source
 * cannot crash the whole dashboard/wizard. Each tab or wizard step that reads
 * async data should wrap its content in this.
 */
export function SuspenseWithErrorBoundary({ children, loadingFallback, onReset, resetLabelKey }: Props) {
  const { t } = useTranslation()
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <LayoutCard>
          <Alert status="danger" role="alert">
            <AlertText>{localizeError(error, t) || t('common.errors.unknownLoadError')}</AlertText>
          </Alert>
          <ActionGroup>
            <Button onPress={resetErrorBoundary}>{t('common.errors.retry')}</Button>
            {onReset && (
              <Button variant="soft" color="secondary" onPress={onReset}>
                {t(resetLabelKey ?? 'common.actions.backToStart')}
              </Button>
            )}
          </ActionGroup>
        </LayoutCard>
      )}
    >
      <Suspense
        fallback={
          loadingFallback ?? (
            <LayoutCard>
              <SkeletonText />
            </LayoutCard>
          )
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}
