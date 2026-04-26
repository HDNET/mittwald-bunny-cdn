import { ColumnLayout, Flex, Heading, Label, LabeledValue, Section, Text } from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'
import { formatBytes } from '~/components/shared/format-bytes'
import { TrendBadge } from '~/components/shared/TrendBadge'
import type { PullZoneStats } from '~/shared/types'

interface Props {
  stats: PullZoneStats
}

export function HeroKpis({ stats }: Props) {
  const { t, i18n } = useTranslation()
  const numberFormatter = new Intl.NumberFormat(i18n.language)
  // bunny.net's billing API returns USD regardless of the user's locale
  // (`ThisMonthCharges`, `Balance`). Don't fake EUR — show what the user is
  // actually charged.
  const currencyFormatter = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' })
  const percentFormatter = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 })

  return (
    <Section>
      <Heading>{t('dashboard.heroKpis.heading')}</Heading>
      <ColumnLayout m={[1]} l={[1, 1, 1, 1]}>
        <LabeledValue>
          <Label>{t('dashboard.heroKpis.labels.requests')}</Label>
          <Flex>
            <Text>{numberFormatter.format(stats.requests)}</Text>
            <TrendBadge current={stats.requests} previous={stats.previous?.requests} direction="higherIsBetter" />
          </Flex>
        </LabeledValue>
        <LabeledValue>
          <Label>{t('dashboard.heroKpis.labels.traffic')}</Label>
          <Flex>
            <Text>{formatBytes(stats.bandwidth)}</Text>
            <TrendBadge current={stats.bandwidth} previous={stats.previous?.bandwidth} direction="higherIsBetter" />
          </Flex>
        </LabeledValue>
        <LabeledValue>
          <Label>{t('dashboard.heroKpis.labels.hitRate')}</Label>
          <Flex>
            <Text>{percentFormatter.format(stats.cacheHitRate / 100)}</Text>
            <TrendBadge
              current={stats.cacheHitRate}
              previous={stats.previous?.cacheHitRate}
              direction="higherIsBetter"
            />
          </Flex>
        </LabeledValue>
        <LabeledValue>
          <Label>{t('dashboard.heroKpis.labels.costs')}</Label>
          <Text>{currencyFormatter.format(stats.monthlyCharges)}</Text>
        </LabeledValue>
      </ColumnLayout>
      {stats.balance > 0 && (
        <ColumnLayout m={[1]} l={[1, 1]}>
          <LabeledValue>
            <Label>{t('dashboard.heroKpis.labels.balance')}</Label>
            <Text>{currencyFormatter.format(stats.balance)}</Text>
          </LabeledValue>
          <LabeledValue>
            <Label>{t('dashboard.heroKpis.labels.accountTraffic')}</Label>
            <Text>{formatBytes(stats.monthlyBandwidth)}</Text>
          </LabeledValue>
        </ColumnLayout>
      )}
    </Section>
  )
}
