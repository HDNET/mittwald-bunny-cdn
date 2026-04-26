import { Alert, AlertText, Flex, LayoutCard, Tab, Tabs, TabTitle, Text } from '@mittwald/flow-remote-react-components'
import { Title } from '@mittwald/mstudio-ext-react-components'
import i18next from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SuspenseWithErrorBoundary } from '~/components/shared/SuspenseWithErrorBoundary'
import { BunnyCdnGhost } from '~/ghosts'
import { localizeError } from '~/lib/localize-error'
import type { PullZoneStatusResponse } from '~/shared/types'
import { AboutTab } from './tabs/AboutTab'
import { AccountTab } from './tabs/AccountTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { IntegrationTab } from './tabs/IntegrationTab'
import { SettingsTab } from './tabs/SettingsTab'

interface Props {
  onStateChange: () => void
}

interface ResolvedPullZone {
  id: number
  cdnDomain: string
  originUrl: string
  cdnMode: 'asset' | 'full-site'
  customHostname: string | null
  enabled: boolean
  euOnly: boolean
  optimizer: NonNullable<PullZoneStatusResponse['optimizer']>
  cacheTtl: NonNullable<PullZoneStatusResponse['cacheTtl']>
  hotlink: NonNullable<PullZoneStatusResponse['hotlink']>
  smartCache: boolean
  health: PullZoneStatusResponse['health']
}

/**
 * Narrow a `PullZoneStatusResponse` for the dashboard. Throws on missing
 * identity fields (`id`, `cdnDomain`, `originUrl`, `cdnMode`) — those are
 * guaranteed by `getPullZoneStatusFn` whenever `exists === true`, so a
 * missing one indicates a backend-layer bug and is worth surfacing through
 * the nearest `SuspenseWithErrorBoundary` rather than masking with defaults.
 *
 * The BunnyCDN-sync-dependent settings (`optimizer`, `cacheTtl`, `hotlink`,
 * `smartCache`, `enabled`, `health`) are *not* guaranteed: when no API key
 * is stored or the upstream sync failed, they stay undefined. We keep the
 * soft defaults for those so the dashboard can render its "Integration"
 * tab (DNS/TypoScript hints) even without a live BunnyCDN connection.
 */
function resolvePullZone(pz: PullZoneStatusResponse): ResolvedPullZone {
  if (pz.id === undefined || pz.cdnDomain === undefined || pz.originUrl === undefined || pz.cdnMode === undefined) {
    // Thrown at render time — caught by the SuspenseWithErrorBoundary wrapping
    // the dashboard. We reach for the module-level i18next because this helper
    // runs outside a hook context.
    throw new Error(i18next.t('errors.PULL_ZONE_RESPONSE_INCOMPLETE'))
  }
  return {
    id: pz.id,
    cdnDomain: pz.cdnDomain,
    originUrl: pz.originUrl,
    cdnMode: pz.cdnMode,
    customHostname: pz.customHostname ?? null,
    enabled: pz.enabled ?? true,
    euOnly: pz.euOnly ?? false,
    optimizer: pz.optimizer ?? { image: false, webp: false, avif: false, cssMinify: false, jsMinify: false },
    cacheTtl: pz.cacheTtl ?? { edge: -1, browser: -1 },
    hotlink: pz.hotlink ?? { enabled: false, allowedReferrers: [] },
    smartCache: pz.smartCache ?? false,
    health: pz.health,
  }
}

function extractDomainFromOrigin(originUrl: string): string {
  try {
    return new URL(originUrl).hostname
  } catch {
    return originUrl.replace(/^https?:\/\//, '').split('/')[0]
  }
}

export function DashboardShell({ onStateChange }: Props) {
  return (
    <SuspenseWithErrorBoundary>
      <DashboardContent onStateChange={onStateChange} />
    </SuspenseWithErrorBoundary>
  )
}

function DashboardContent({ onStateChange }: Props) {
  const { t } = useTranslation()
  const { value: pullZone } = BunnyCdnGhost.getPullZoneStatus().useGhost()
  const stats = BunnyCdnGhost.getStats().use()
  const [msg, setMsg] = useState<{ text: string; status: 'success' | 'danger' } | null>(null)

  async function handleDelete() {
    try {
      await BunnyCdnGhost.deletePullZone()
      onStateChange()
    } catch (e) {
      setMsg({ text: localizeError(e, t), status: 'danger' })
    }
  }

  if (!pullZone?.exists) return <Text>{t('dashboard.noPullZone')}</Text>
  const pz = resolvePullZone(pullZone)
  const onError = (m: string) => setMsg({ text: m, status: 'danger' })

  return (
    <>
      <Title>{t('dashboard.title')}</Title>

      <Flex direction="column" gap="m">
        {msg && (
          <LayoutCard>
            <Alert status={msg.status} role={msg.status === 'danger' ? 'alert' : 'status'}>
              <AlertText>{msg.text}</AlertText>
            </Alert>
          </LayoutCard>
        )}

        {!pz.enabled && (
          <LayoutCard>
            <Alert status="warning">
              <AlertText>{t('dashboard.zonePausedBanner')}</AlertText>
            </Alert>
          </LayoutCard>
        )}

        <LayoutCard>
          <Tabs defaultSelectedKey={stats ? 'analytics' : 'integration'}>
            <Tab id="analytics">
              <TabTitle>{t('dashboard.tabs.analytics')}</TabTitle>
              <AnalyticsTab
                enabled={pz.enabled}
                stats={stats}
                cdnDomain={pz.cdnDomain}
                originUrl={pz.originUrl}
                cdnMode={pz.cdnMode}
                euOnly={pz.euOnly}
                health={pz.health}
              />
            </Tab>

            <Tab id="settings">
              <TabTitle>{t('dashboard.tabs.settings')}</TabTitle>
              <SettingsTab
                enabled={pz.enabled}
                euOnly={pz.euOnly}
                hotlink={pz.hotlink}
                optimizer={pz.optimizer}
                cacheTtl={pz.cacheTtl}
                smartCache={pz.smartCache}
                onPatched={onStateChange}
                onError={onError}
              />
            </Tab>

            <Tab id="integration">
              <TabTitle>{t('dashboard.tabs.integration')}</TabTitle>
              <IntegrationTab
                pullZoneId={pz.id}
                cdnDomain={pz.cdnDomain}
                cdnMode={pz.cdnMode}
                customHostname={pz.customHostname}
                domain={extractDomainFromOrigin(pz.originUrl)}
                onPatched={onStateChange}
                onError={onError}
              />
            </Tab>

            <Tab id="account">
              <TabTitle>{t('dashboard.tabs.account')}</TabTitle>
              <AccountTab onPatched={onStateChange} onError={onError} onDelete={handleDelete} />
            </Tab>

            <Tab id="about">
              <TabTitle>{t('dashboard.tabs.about')}</TabTitle>
              <AboutTab />
            </Tab>
          </Tabs>
        </LayoutCard>
      </Flex>
    </>
  )
}
