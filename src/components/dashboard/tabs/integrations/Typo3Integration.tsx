import {
  Accordion,
  Badge,
  CodeBlock,
  Content,
  CopyButton,
  Flex,
  Heading,
  Link,
  Separator,
  Text,
} from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'
import type { IntegrationProps } from './types'

export function Typo3Integration({ pullZoneId, cdnDomain, cdnMode }: IntegrationProps) {
  const { t } = useTranslation()
  const snippet =
    cdnMode === 'asset'
      ? t('dashboard.typo3Integration.snippet.asset', { cdnDomain })
      : t('dashboard.typo3Integration.snippet.fullSite')

  return (
    <Flex direction="column" gap="m">
      <Flex gap="s" align="center" wrap="wrap">
        <Heading>
          {cdnMode === 'asset'
            ? t('dashboard.typo3Integration.asset.heading')
            : t('dashboard.typo3Integration.fullSite.heading')}
        </Heading>
        {cdnMode === 'full-site' && <Badge color="green">{t('dashboard.typo3Integration.fullSite.badge')}</Badge>}
      </Flex>
      <Text>
        {cdnMode === 'asset'
          ? t('dashboard.typo3Integration.asset.description', { cdnDomain })
          : t('dashboard.typo3Integration.fullSite.description')}
      </Text>
      <CodeBlock>{snippet}</CodeBlock>
      <CopyButton text={snippet} />

      <Separator />

      <Heading>{t('dashboard.typo3Integration.tipsHeading')}</Heading>
      <Accordion>
        <Heading>{t('dashboard.typo3Integration.tips.cacheHeaders.heading')}</Heading>
        <Content>
          <Text>{t('dashboard.typo3Integration.tips.cacheHeaders.description')}</Text>
          <CodeBlock>config.sendCacheHeaders = 1</CodeBlock>
          <CopyButton text="config.sendCacheHeaders = 1" />
        </Content>
      </Accordion>
      <Accordion>
        <Heading>{t('dashboard.typo3Integration.tips.imageOpt.heading')}</Heading>
        <Content>
          <Text>{t('dashboard.typo3Integration.tips.imageOpt.description')}</Text>
          <Link href={`https://dash.bunny.net/cdn/${pullZoneId}/optimizer`} target="_blank">
            {t('dashboard.typo3Integration.tips.imageOpt.link')}
          </Link>
        </Content>
      </Accordion>
      <Accordion>
        <Heading>{t('dashboard.typo3Integration.tips.loggedIn.heading')}</Heading>
        <Content>
          <Text>
            {cdnMode === 'full-site'
              ? t('dashboard.typo3Integration.tips.loggedIn.fullSite')
              : t('dashboard.typo3Integration.tips.loggedIn.asset')}
          </Text>
        </Content>
      </Accordion>
      <Accordion>
        <Heading>{t('dashboard.typo3Integration.tips.deployment.heading')}</Heading>
        <Content>
          <Text>{t('dashboard.typo3Integration.tips.deployment.description')}</Text>
        </Content>
      </Accordion>
    </Flex>
  )
}
