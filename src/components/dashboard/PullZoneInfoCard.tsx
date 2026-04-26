import {
  Badge,
  ColumnLayout,
  Heading,
  InlineCode,
  Label,
  LabeledValue,
  Section,
} from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'
import { StatusDot } from '~/components/shared/StatusDot'
import type { HealthStatus, PullZoneHealth } from '~/shared/types'

interface Props {
  cdnDomain: string
  originUrl: string
  cdnMode: 'asset' | 'full-site'
  euOnly: boolean
  enabled: boolean
  health: PullZoneHealth | undefined
}

function sslLabel(status: HealthStatus, t: ReturnType<typeof useTranslation>['t']): string {
  if (status === 'ok') return t('dashboard.infoCard.ssl.ok')
  if (status === 'pending') return t('dashboard.infoCard.ssl.pending')
  return t('dashboard.infoCard.ssl.missing')
}

function dnsLabel(status: HealthStatus, t: ReturnType<typeof useTranslation>['t']): string {
  if (status === 'ok') return t('dashboard.infoCard.dns.ok')
  if (status === 'pending') return t('dashboard.infoCard.dns.pending')
  return t('dashboard.infoCard.dns.missing')
}

function originLabel(status: HealthStatus, t: ReturnType<typeof useTranslation>['t']): string {
  if (status === 'ok') return t('dashboard.infoCard.origin.ok')
  if (status === 'slow') return t('dashboard.infoCard.origin.slow')
  if (status === 'down') return t('dashboard.infoCard.origin.down')
  return t('dashboard.infoCard.origin.unknown')
}

/**
 * Read-only pull-zone status panel shown across all dashboard tabs. The
 * pause toggle that used to live here moved to the Settings tab — this card
 * is information only.
 */
export function PullZoneInfoCard({ cdnDomain, originUrl, cdnMode, euOnly, enabled, health }: Props) {
  const { t } = useTranslation()
  const ssl = health?.ssl ?? 'unknown'
  const dns = health?.dns ?? 'unknown'
  const origin = health?.origin ?? 'unknown'

  return (
    <Section>
      <Heading>{t('dashboard.infoCard.heading')}</Heading>
      <ColumnLayout m={[1]} l={[1, 1, 1, 1]}>
        <StatusDot status={enabled ? 'ok' : 'down'}>
          {enabled ? t('dashboard.infoCard.zoneActive') : t('dashboard.infoCard.zonePaused')}
        </StatusDot>
        <StatusDot status={ssl}>{sslLabel(ssl, t)}</StatusDot>
        <StatusDot status={dns}>{dnsLabel(dns, t)}</StatusDot>
        <StatusDot status={origin}>{originLabel(origin, t)}</StatusDot>
      </ColumnLayout>
      <ColumnLayout m={[1]} l={[1, 1, 1]}>
        <LabeledValue>
          <Label>{t('dashboard.infoCard.labels.cdnDomain')}</Label>
          <InlineCode>{cdnDomain}</InlineCode>
        </LabeledValue>
        <LabeledValue>
          <Label>{t('dashboard.infoCard.labels.origin')}</Label>
          <InlineCode>{originUrl}</InlineCode>
        </LabeledValue>
        <LabeledValue>
          <Label>{t('dashboard.infoCard.labels.mode')}</Label>
          <Badge color={cdnMode === 'asset' ? 'blue' : 'green'}>
            {cdnMode === 'asset'
              ? t('dashboard.infoCard.modeBadges.asset')
              : t('dashboard.infoCard.modeBadges.fullSite')}
          </Badge>
          {euOnly && <Badge color="teal">{t('dashboard.infoCard.euOnlyBadge')}</Badge>}
        </LabeledValue>
      </ColumnLayout>
    </Section>
  )
}
