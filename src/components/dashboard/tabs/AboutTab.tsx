import {
  ColumnLayout,
  Flex,
  Heading,
  InlineCode,
  Label,
  LabeledValue,
  Link,
  Section,
  Text,
} from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'
// Named import so Vite tree-shakes everything else from package.json out of
// the client bundle.
import { version as appVersion } from '../../../../package.json'

export function AboutTab() {
  const { t } = useTranslation()

  return (
    <Flex direction="column" gap="m">
      <Section>
        <Heading>{t('dashboard.aboutTab.extension.heading')}</Heading>
        <ColumnLayout m={[1]} l={[1, 1]}>
          <LabeledValue>
            <Label>{t('dashboard.aboutTab.extension.versionLabel')}</Label>
            <InlineCode>{appVersion}</InlineCode>
          </LabeledValue>
          <LabeledValue>
            <Label>{t('dashboard.aboutTab.extension.developedByLabel')}</Label>
            <Link href="https://www.hdnet.de" target="_blank">
              HDNET GmbH & Co. KG
            </Link>
          </LabeledValue>
        </ColumnLayout>
      </Section>

      <Section>
        <Heading>{t('dashboard.aboutTab.support.heading')}</Heading>
        <Text>{t('dashboard.aboutTab.support.text')}</Text>
        <ColumnLayout m={[1]} l={[1, 1]}>
          <LabeledValue>
            <Label>{t('dashboard.aboutTab.support.emailLabel')}</Label>
            <Link href="mailto:hosting@hdnet.de">hosting@hdnet.de</Link>
          </LabeledValue>
          <LabeledValue>
            <Label>{t('dashboard.aboutTab.support.issuesLabel')}</Label>
            <Link href="https://github.com/HDNET/mittwald-bunny-cdn/issues" target="_blank">
              GitHub Issues
            </Link>
          </LabeledValue>
        </ColumnLayout>
      </Section>

      <Section>
        <Heading>{t('dashboard.aboutTab.disclaimerHeading')}</Heading>
        <Text>{t('dashboard.aboutTab.disclaimer')}</Text>
      </Section>
    </Flex>
  )
}
