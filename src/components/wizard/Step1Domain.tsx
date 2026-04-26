import {
  ActionGroup,
  Alert,
  AlertText,
  Button,
  Content,
  Heading,
  InlineCode,
  Label,
  LayoutCard,
  Option,
  Select,
  Text,
} from '@mittwald/flow-remote-react-components'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SuspenseWithErrorBoundary } from '~/components/shared/SuspenseWithErrorBoundary'
import { BunnyCdnGhost } from '~/ghosts'
import type { DomainResponse } from '~/shared/types'

interface Props {
  selectedDomain: DomainResponse | null
  onSelect: (d: DomainResponse | null) => void
  onNext: () => void
  onBack: () => void
  onSetOrigin: (origin: string) => void
  /**
   * Called when the user gives up on retrying the domain fetch and wants to
   * go back to Step 0 (API-Key) instead. The typical reason this boundary
   * fails is an invalid API key — retrying the identical request forever
   * doesn't help.
   */
  onResetApiKey?: () => void
}

export function Step1Domain(props: Props) {
  return (
    <SuspenseWithErrorBoundary onReset={props.onResetApiKey} resetLabelKey="wizard.step1.retryApiKey">
      <DomainStepContent {...props} />
    </SuspenseWithErrorBoundary>
  )
}

function DomainStepContent({ selectedDomain, onSelect, onNext, onBack, onSetOrigin }: Props) {
  const { t } = useTranslation()
  const data = BunnyCdnGhost.getDomains().use()
  const apiKeyStatus = BunnyCdnGhost.getApiKeyStatus().use()
  const domains = data?.domains ?? []
  const defaultOrigin = data?.defaultOrigin

  useEffect(() => {
    if (defaultOrigin) onSetOrigin(defaultOrigin)
  }, [defaultOrigin, onSetOrigin])

  return (
    <>
      <LayoutCard>
        <Heading>{t('wizard.step1.heading')}</Heading>
        <Content>
          <Text>{t('wizard.step1.description')}</Text>
          {apiKeyStatus?.last4 && (
            <Text>
              {t('wizard.step1.apiKeyInUse')} <InlineCode>…{apiKeyStatus.last4}</InlineCode>
            </Text>
          )}
          {domains.length === 0 ? (
            <Alert status="info">
              <AlertText>{t('wizard.step1.empty')}</AlertText>
            </Alert>
          ) : (
            <Select
              selectedKey={selectedDomain?.id ?? null}
              onSelectionChange={(key) => onSelect(domains.find((d: DomainResponse) => d.id === String(key)) ?? null)}
            >
              <Label>{t('wizard.step1.domainLabel')}</Label>
              {domains.map((d: DomainResponse) => (
                <Option key={d.id} value={d.id}>
                  {d.hostname}
                </Option>
              ))}
            </Select>
          )}
        </Content>
      </LayoutCard>
      <LayoutCard>
        <ActionGroup>
          <Button variant="soft" color="secondary" onPress={onBack}>
            {t('common.actions.back')}
          </Button>
          <Button onPress={onNext} isDisabled={!selectedDomain}>
            {t('common.actions.next')}
          </Button>
        </ActionGroup>
      </LayoutCard>
    </>
  )
}
