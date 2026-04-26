import { Alert, AlertText, Button, Content, Heading, LayoutCard, Section } from '@mittwald/flow-remote-react-components'
import RemoteRoot from '@mittwald/flow-remote-react-components/RemoteRoot'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import i18next from 'i18next'
import { ErrorBoundary } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'
// Side-effect import: initialises i18next with the mittwald
// `remoteLanguageDetectorModule`. Must be loaded before any
// `useTranslation()` call anywhere in the tree.
import '~/i18n'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'bunny.net Extension' },
    ],
  }),
  component: RootComponent,
})

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const { t } = useTranslation()
  return (
    <LayoutCard>
      <Section>
        <Heading>{t('common.errors.heading')}</Heading>
        <Content>
          <Alert status="danger" role="alert">
            <AlertText>{error.message}</AlertText>
          </Alert>
          <Button onPress={resetErrorBoundary}>{t('common.errors.retry')}</Button>
        </Content>
      </Section>
    </LayoutCard>
  )
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  // Read i18next directly (no `useTranslation()`) so RootComponent does not
  // re-render every time the language detector resolves — that re-render
  // races with the ExtBridge handshake and surfaces a "state update on
  // unmounted component" warning. `lang` only matters at HTML parse time
  // anyway; switching languages later is rare and doesn't need to update it.
  const lang = i18next.language || 'de'

  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <RemoteRoot>
            <ErrorBoundary
              fallbackRender={(props) => (
                <ErrorFallback
                  // @ts-expect-error — react-error-boundary types error as unknown
                  error={props.error}
                  resetErrorBoundary={props.resetErrorBoundary}
                />
              )}
            >
              <Outlet />
            </ErrorBoundary>
          </RemoteRoot>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
