import {
  ActionGroup,
  Badge,
  Button,
  ColumnLayout,
  Content,
  Flex,
  Heading,
  InlineCode,
  Label,
  LabeledValue,
  LayoutCard,
  Text,
} from '@mittwald/flow-remote-react-components'
import { Trans, useTranslation } from 'react-i18next'
import type { DomainResponse } from '~/shared/types'

interface Props {
  selectedDomain: DomainResponse | null
  cdnMode: 'asset' | 'full-site'
  defaultOrigin: string | null
  customHostnameEnabled: boolean
  creating: boolean
  onCreate: () => void
  onBack: () => void
}

function NextStep({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <Text elementType="p">
      {number}. {children}
    </Text>
  )
}

function AssetNextSteps({ hostname, withCustomHostname }: { hostname: string; withCustomHostname: boolean }) {
  const { t } = useTranslation()
  if (withCustomHostname) {
    return (
      <>
        <NextStep number={1}>{t('wizard.step3.nextSteps.asset.withCustomHostname.step1')}</NextStep>
        <NextStep number={2}>
          <Trans
            i18nKey="wizard.step3.nextSteps.asset.withCustomHostname.step2"
            values={{ hostname }}
            components={{ 1: <InlineCode /> }}
          />
        </NextStep>
        <NextStep number={3}>
          <Trans
            i18nKey="wizard.step3.nextSteps.asset.withCustomHostname.step3"
            values={{ hostname }}
            components={{ 1: <InlineCode /> }}
          />
        </NextStep>
        <NextStep number={4}>{t('wizard.step3.nextSteps.asset.withCustomHostname.step4')}</NextStep>
      </>
    )
  }
  return (
    <>
      <NextStep number={1}>{t('wizard.step3.nextSteps.asset.withoutCustomHostname.step1')}</NextStep>
      <NextStep number={2}>
        <Trans
          i18nKey="wizard.step3.nextSteps.asset.withoutCustomHostname.step2"
          values={{ hostname }}
          components={{ 1: <InlineCode /> }}
        />
      </NextStep>
      <NextStep number={3}>{t('wizard.step3.nextSteps.asset.withoutCustomHostname.step3')}</NextStep>
    </>
  )
}

function FullSiteNextSteps({ hostname }: { hostname: string }) {
  const { t } = useTranslation()
  return (
    <>
      <NextStep number={1}>{t('wizard.step3.nextSteps.fullSite.step1')}</NextStep>
      <NextStep number={2}>
        <Trans
          i18nKey="wizard.step3.nextSteps.fullSite.step2"
          values={{ hostname }}
          components={{ 1: <InlineCode /> }}
        />
      </NextStep>
      <NextStep number={3}>
        <Trans
          i18nKey="wizard.step3.nextSteps.fullSite.step3"
          values={{ hostname }}
          components={{ 1: <InlineCode /> }}
        />
      </NextStep>
    </>
  )
}

export function Step3Confirm({
  selectedDomain,
  cdnMode,
  defaultOrigin,
  customHostnameEnabled,
  creating,
  onCreate,
  onBack,
}: Props) {
  const { t } = useTranslation()
  const hostname = selectedDomain?.hostname ?? ''
  const willUseCustomHostname = cdnMode === 'full-site' || customHostnameEnabled
  const cdnSubdomain = cdnMode === 'asset' ? `cdn.${hostname}` : `www.${hostname}`
  const origin =
    cdnMode === 'asset'
      ? hostname
      : defaultOrigin
        ? new URL(defaultOrigin).hostname
        : t('wizard.step3.labels.internalOrigin')

  return (
    <>
      <LayoutCard>
        <Heading>{t('wizard.step3.heading')}</Heading>
        <Content>
          <Text>{t('wizard.step3.description')}</Text>
        </Content>
      </LayoutCard>

      <LayoutCard>
        <Heading>{t('wizard.step3.configHeading')}</Heading>
        <Content>
          <ColumnLayout m={[1]} l={[1, 1]}>
            <LabeledValue>
              <Label>{t('wizard.step3.labels.domain')}</Label>
              <InlineCode>{hostname}</InlineCode>
            </LabeledValue>
            <LabeledValue>
              <Label>{t('wizard.step3.labels.cdnMode')}</Label>
              <Badge color={cdnMode === 'asset' ? 'blue' : 'green'}>
                {cdnMode === 'asset' ? t('wizard.step3.modeBadges.asset') : t('wizard.step3.modeBadges.fullSite')}
              </Badge>
            </LabeledValue>
            <LabeledValue>
              <Label>
                {cdnMode === 'asset' ? t('wizard.step3.labels.cdnSubdomain') : t('wizard.step3.labels.cdnHostname')}
              </Label>
              <InlineCode>{willUseCustomHostname ? cdnSubdomain : t('wizard.step3.labels.pullZoneOnly')}</InlineCode>
            </LabeledValue>
            <LabeledValue>
              <Label>{t('wizard.step3.labels.origin')}</Label>
              <InlineCode>{origin}</InlineCode>
            </LabeledValue>
          </ColumnLayout>
        </Content>
      </LayoutCard>

      <LayoutCard>
        <Heading>{t('wizard.step3.nextStepsHeading')}</Heading>
        <Content>
          <Flex direction="column" gap="s">
            {cdnMode === 'asset' ? (
              <AssetNextSteps hostname={hostname} withCustomHostname={willUseCustomHostname} />
            ) : (
              <FullSiteNextSteps hostname={hostname} />
            )}
          </Flex>
        </Content>
      </LayoutCard>

      <LayoutCard>
        <ActionGroup>
          <Button variant="soft" color="secondary" onPress={onBack} isDisabled={creating}>
            {t('common.actions.back')}
          </Button>
          <Button onPress={onCreate} isDisabled={creating || (cdnMode === 'full-site' && !defaultOrigin)}>
            {creating ? t('wizard.step3.creating') : t('wizard.step3.cta')}
          </Button>
        </ActionGroup>
      </LayoutCard>
    </>
  )
}
