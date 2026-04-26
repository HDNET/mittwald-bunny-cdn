import {
  ActionGroup,
  Alert,
  AlertText,
  Badge,
  Button,
  ColumnLayout,
  Content,
  Flex,
  Heading,
  InlineCode,
  LayoutCard,
  Segment,
  SegmentedControl,
  Switch,
  Text,
} from '@mittwald/flow-remote-react-components'
import { Trans, useTranslation } from 'react-i18next'
import type { DomainResponse } from '~/shared/types'

interface Props {
  selectedDomain: DomainResponse | null
  cdnMode: 'asset' | 'full-site'
  /**
   * mittwald-Projekt-Origin aus `ingressListIngresses`. `null` bedeutet:
   * der Ingress-Call ist fehlgeschlagen oder es gibt keinen default-
   * Ingress — Full-Site-CDN lässt sich ohne Origin nicht aufsetzen.
   */
  defaultOrigin: string | null
  customHostnameEnabled: boolean
  onCdnModeChange: (mode: 'asset' | 'full-site') => void
  onCustomHostnameEnabledChange: (enabled: boolean) => void
  onNext: () => void
  onBack: () => void
}

export function Step2Mode({
  selectedDomain,
  cdnMode,
  defaultOrigin,
  customHostnameEnabled,
  onCdnModeChange,
  onCustomHostnameEnabledChange,
  onNext,
  onBack,
}: Props) {
  const { t } = useTranslation()
  const hostname = selectedDomain?.hostname ?? ''
  const fullSiteAvailable = defaultOrigin !== null
  const cdnSubdomain = selectedDomain ? `cdn.${selectedDomain.hostname}` : 'cdn.<deine-domain>'
  return (
    <>
      <LayoutCard>
        <Heading>{t('wizard.step2.heading')}</Heading>
        <Content>
          <Text>{t('wizard.step2.description')}</Text>
        </Content>
      </LayoutCard>

      <ColumnLayout m={[1]} l={[1, 1]}>
        <LayoutCard>
          <Flex direction="column" gap="m">
            <Heading>{t('wizard.step2.assetCdn.heading')}</Heading>
            <Badge color="blue">{t('wizard.step2.assetCdn.badge')}</Badge>
            <Text>
              <Trans
                i18nKey="wizard.step2.assetCdn.description"
                values={{ hostname }}
                components={{ 1: <InlineCode /> }}
              />
            </Text>
            <Alert status="success">
              <AlertText>{t('wizard.step2.assetCdn.benefit')}</AlertText>
            </Alert>
            <Alert status="warning">
              <AlertText>{t('wizard.step2.assetCdn.downside')}</AlertText>
            </Alert>
          </Flex>
        </LayoutCard>

        <LayoutCard>
          <Flex direction="column" gap="m">
            <Heading>{t('wizard.step2.fullSiteCdn.heading')}</Heading>
            <Badge color="green">{t('wizard.step2.fullSiteCdn.badge')}</Badge>
            <Text>
              <Trans
                i18nKey="wizard.step2.fullSiteCdn.description"
                values={{ hostname }}
                components={{ 1: <InlineCode /> }}
              />
            </Text>
            <Alert status="success">
              <AlertText>{t('wizard.step2.fullSiteCdn.benefit')}</AlertText>
            </Alert>
            <Alert status="warning">
              <AlertText>{t('wizard.step2.fullSiteCdn.downside')}</AlertText>
            </Alert>
            {!fullSiteAvailable && (
              <Alert status="danger">
                <AlertText>{t('wizard.step2.fullSiteCdn.unavailable')}</AlertText>
              </Alert>
            )}
          </Flex>
        </LayoutCard>
      </ColumnLayout>

      <LayoutCard>
        <Content>
          <SegmentedControl value={cdnMode} onChange={(v) => onCdnModeChange(v as 'asset' | 'full-site')}>
            <Segment value="asset">{t('wizard.step2.segments.asset')}</Segment>
            <Segment value="full-site" isDisabled={!fullSiteAvailable}>
              {t('wizard.step2.segments.fullSite')}
            </Segment>
          </SegmentedControl>
        </Content>
      </LayoutCard>

      {cdnMode === 'asset' && (
        <LayoutCard>
          <Heading>{t('wizard.step2.customHostname.heading')}</Heading>
          <Content>
            <Flex direction="column" gap="s">
              <Text>
                <Trans
                  i18nKey="wizard.step2.customHostname.description"
                  values={{ subdomain: cdnSubdomain }}
                  components={{ 1: <InlineCode /> }}
                />
              </Text>
              <Switch isSelected={customHostnameEnabled} onChange={onCustomHostnameEnabledChange}>
                {t('wizard.step2.customHostname.toggle')}
              </Switch>
            </Flex>
          </Content>
        </LayoutCard>
      )}

      <LayoutCard>
        <ActionGroup>
          <Button variant="soft" color="secondary" onPress={onBack}>
            {t('common.actions.back')}
          </Button>
          <Button onPress={onNext}>{t('common.actions.next')}</Button>
        </ActionGroup>
      </LayoutCard>
    </>
  )
}
