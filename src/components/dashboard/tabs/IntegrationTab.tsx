import { Accordion, Content, Flex, Heading, Section, Text } from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'
import { CustomHostnameCard } from './CustomHostnameCard'
import { INTEGRATIONS, type IntegrationProps } from './integrations'

interface Props extends IntegrationProps {
  customHostname: string | null | undefined
  domain: string
  onPatched: () => void
  onError: (message: string) => void
}

export function IntegrationTab({ customHostname, domain, onPatched, onError, ...integrationProps }: Props) {
  const { t } = useTranslation()
  // Auto-expand when there's only one integration — no point hiding the sole
  // content behind a click. Once the registry grows past one, each accordion
  // stays collapsed by default and the user picks which system to look at.
  const expandAll = INTEGRATIONS.length === 1

  return (
    <Flex direction="column" gap="m">
      <CustomHostnameCard
        cdnMode={integrationProps.cdnMode}
        customHostname={customHostname}
        domain={domain}
        cdnDomain={integrationProps.cdnDomain}
        onPatched={onPatched}
        onError={onError}
      />

      <Section>
        <Heading>{t('dashboard.integrationTab.heading')}</Heading>
        <Text>{t('dashboard.integrationTab.description')}</Text>
      </Section>

      {INTEGRATIONS.map((integration) => {
        const IntegrationComponent = integration.component
        return (
          <Section key={integration.id}>
            <Accordion defaultExpanded={expandAll}>
              <Heading>{integration.name}</Heading>
              <Content>
                <IntegrationComponent {...integrationProps} />
              </Content>
            </Accordion>
          </Section>
        )
      })}
    </Flex>
  )
}
