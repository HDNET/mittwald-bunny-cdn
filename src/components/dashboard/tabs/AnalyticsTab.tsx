import {
  CartesianChart,
  ChartGrid,
  ChartTooltip,
  ColumnLayout,
  Content,
  DonutChart,
  Flex,
  Heading,
  IllustratedMessage,
  InlineCode,
  Label,
  LabeledValue,
  Line,
  Section,
  Text,
  XAxis,
  YAxis,
} from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'
import { HeroKpis } from '~/components/dashboard/HeroKpis'
import { PullZoneInfoCard } from '~/components/dashboard/PullZoneInfoCard'
import { formatBytes } from '~/components/shared/format-bytes'
import type { PullZoneHealth, PullZoneStats, PullZoneStatsSeries } from '~/shared/types'

interface Props {
  enabled: boolean
  stats: PullZoneStats | null
  cdnDomain: string
  originUrl: string
  cdnMode: 'asset' | 'full-site'
  euOnly: boolean
  health: PullZoneHealth | undefined
}

function formatShortDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // day/month without year — matches the original `dd.mm.` shape in DE and
  // produces a locale-appropriate short form everywhere else.
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(d)
}

function prepareSeries(series: PullZoneStatsSeries[], locale: string) {
  return series.map((s) => ({ ...s, label: formatShortDate(s.date, locale) }))
}

function pickBandwidthUnit(series: PullZoneStatsSeries[]): { divisor: number; unit: string } {
  const max = Math.max(...series.map((s) => s.value), 0)
  if (max >= 1024 ** 4) return { divisor: 1024 ** 4, unit: 'TB' }
  if (max >= 1024 ** 3) return { divisor: 1024 ** 3, unit: 'GB' }
  return { divisor: 1024 ** 2, unit: 'MB' }
}

function prepareBandwidthSeries(series: PullZoneStatsSeries[], divisor: number, locale: string) {
  return series.map((s) => ({
    ...s,
    value: +(s.value / divisor).toFixed(1),
    label: formatShortDate(s.date, locale),
  }))
}

export function AnalyticsTab({ enabled, stats, cdnDomain, originUrl, cdnMode, euOnly, health }: Props) {
  const { t, i18n } = useTranslation()
  const headerCards = (
    <PullZoneInfoCard
      cdnDomain={cdnDomain}
      originUrl={originUrl}
      cdnMode={cdnMode}
      euOnly={euOnly}
      enabled={enabled}
      health={health}
    />
  )

  if (!enabled) {
    return (
      <Flex direction="column" gap="m">
        {headerCards}
        <Section>
          <IllustratedMessage>
            <Heading>{t('dashboard.analyticsTab.paused.heading')}</Heading>
            <Content>
              <Text>{t('dashboard.analyticsTab.paused.text')}</Text>
            </Content>
          </IllustratedMessage>
        </Section>
      </Flex>
    )
  }

  if (!stats) {
    return (
      <Flex direction="column" gap="m">
        {headerCards}
        <Section>
          <IllustratedMessage>
            <Heading>{t('dashboard.analyticsTab.empty.heading')}</Heading>
            <Content>
              <Text>{t('dashboard.analyticsTab.empty.text')}</Text>
            </Content>
          </IllustratedMessage>
        </Section>
      </Flex>
    )
  }

  const { divisor, unit: bwUnit } = pickBandwidthUnit(stats.series.bandwidth)
  const bandwidthSeries = prepareBandwidthSeries(stats.series.bandwidth, divisor, i18n.language)
  const requestsSeries = prepareSeries(stats.series.requests, i18n.language)
  const hitPct = Math.round(stats.cacheHitRate)
  const missPct = 100 - hitPct
  const bytesSaved = Math.round(stats.bandwidth * (stats.cacheHitRate / 100))

  return (
    <Flex direction="column" gap="m">
      {headerCards}
      <HeroKpis stats={stats} />

      <Section>
        <Heading>{t('dashboard.analyticsTab.cachePerformance')}</Heading>
        <ColumnLayout m={[1]} l={[1, 1]}>
          <DonutChart
            value={stats.cacheHitRate}
            size="l"
            segments={[
              { title: t('dashboard.analyticsTab.cacheHit'), value: hitPct, color: 'sea-green' },
              { title: t('dashboard.analyticsTab.cacheMiss'), value: missPct, color: 'salmon' },
            ]}
          />
          <Flex direction="column" gap="s">
            <LabeledValue>
              <Label>{t('dashboard.analyticsTab.trafficFromCdn')}</Label>
              <InlineCode>{formatBytes(bytesSaved)}</InlineCode>
            </LabeledValue>
            {stats.avgResponseTime > 0 && (
              <LabeledValue>
                <Label>{t('dashboard.analyticsTab.avgOriginResponse')}</Label>
                <InlineCode>{Math.round(stats.avgResponseTime)} ms</InlineCode>
              </LabeledValue>
            )}
            <Text>{t('dashboard.analyticsTab.cachePerformanceExplainer')}</Text>
          </Flex>
        </ColumnLayout>
      </Section>

      <Section>
        <Heading>{t('dashboard.analyticsTab.trafficHeading', { unit: bwUnit })}</Heading>
        <CartesianChart data={bandwidthSeries} height="240px">
          <ChartGrid />
          <XAxis dataKey="label" />
          <YAxis />
          <ChartTooltip />
          <Line dataKey="value" color="sea-green" />
        </CartesianChart>
        <Text>
          {t('dashboard.analyticsTab.trafficSummary', {
            total: formatBytes(stats.bandwidth),
            days: bandwidthSeries.length,
          })}
        </Text>
      </Section>

      <Section>
        <Heading>{t('dashboard.analyticsTab.requestsHeading')}</Heading>
        <CartesianChart data={requestsSeries} height="240px">
          <ChartGrid />
          <XAxis dataKey="label" />
          <YAxis />
          <ChartTooltip />
          <Line dataKey="value" color="violet" />
        </CartesianChart>
        <Text>
          {t('dashboard.analyticsTab.requestsSummary', {
            total: stats.requests.toLocaleString(),
            days: requestsSeries.length,
          })}
        </Text>
      </Section>
    </Flex>
  )
}
