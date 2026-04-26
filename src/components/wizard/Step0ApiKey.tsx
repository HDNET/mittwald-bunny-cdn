import {
  AccentBox,
  Accordion,
  ActionGroup,
  Alert,
  AlertText,
  Button,
  ColumnLayout,
  Content,
  Flex,
  Heading,
  Label,
  LayoutCard,
  Link,
  Text,
  TextField,
} from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'
import { isBunnyApiKeyFormat } from '~/shared/validation'

interface Props {
  apiKey: string
  onApiKeyChange: (v: string) => void
  onNext: () => void
}

export function Step0ApiKey({ apiKey, onApiKeyChange, onNext }: Props) {
  const { t } = useTranslation()
  const trimmed = apiKey.trim()
  const formatInvalid = trimmed.length > 0 && !isBunnyApiKeyFormat(trimmed)
  const submitDisabled = trimmed.length === 0 || formatInvalid

  return (
    <>
      <LayoutCard>
        <Flex direction="column" gap="m">
          <Heading>{t('wizard.step0.heading')}</Heading>
          <Text>
            {t('wizard.step0.descriptionPrefix')}
            <Link href="https://dash.bunny.net/account/settings" target="_blank">
              {t('wizard.step0.profileLink')}
            </Link>
            {t('wizard.step0.descriptionSuffix')}
          </Text>
          <TextField
            type="password"
            value={apiKey}
            onChange={onApiKeyChange}
            placeholder={t('wizard.step0.apiKey.placeholder')}
            isRequired
            isInvalid={formatInvalid}
          >
            <Label>{t('wizard.step0.apiKey.label')}</Label>
          </TextField>
          {formatInvalid && (
            <Alert status="danger" role="alert">
              <AlertText>{t('wizard.step0.apiKey.invalid')}</AlertText>
            </Alert>
          )}
          <Text>
            {t('wizard.step0.dpaHint')}{' '}
            <Link href="https://dash.bunny.net/account/dpa" target="_blank">
              {t('wizard.step0.dpaLink')}
            </Link>
          </Text>
        </Flex>
      </LayoutCard>

      <LayoutCard>
        <Accordion defaultExpanded>
          <Heading>{t('wizard.step0.accordion.heading')}</Heading>
          <Content>
            <Flex direction="column" gap="m">
              <Text>{t('wizard.step0.accordion.intro')}</Text>
              <ColumnLayout m={[1]} l={[1, 1]}>
                <AccentBox backgroundColor="green">
                  <Heading>{t('wizard.step0.accordion.boxes.eu.heading')}</Heading>
                  <Content>
                    <Text>{t('wizard.step0.accordion.boxes.eu.text')}</Text>
                  </Content>
                </AccentBox>
                <AccentBox backgroundColor="blue">
                  <Heading>{t('wizard.step0.accordion.boxes.global.heading')}</Heading>
                  <Content>
                    <Text>{t('wizard.step0.accordion.boxes.global.text')}</Text>
                  </Content>
                </AccentBox>
                <AccentBox backgroundColor="violet">
                  <Heading>{t('wizard.step0.accordion.boxes.typo3.heading')}</Heading>
                  <Content>
                    <Text>{t('wizard.step0.accordion.boxes.typo3.text')}</Text>
                  </Content>
                </AccentBox>
                <AccentBox backgroundColor="teal">
                  <Heading>{t('wizard.step0.accordion.boxes.price.heading')}</Heading>
                  <Content>
                    <Text>{t('wizard.step0.accordion.boxes.price.text')}</Text>
                  </Content>
                </AccentBox>
              </ColumnLayout>
            </Flex>
          </Content>
        </Accordion>
      </LayoutCard>

      <LayoutCard>
        <ActionGroup>
          <Button onPress={onNext} isDisabled={submitDisabled}>
            {t('common.actions.next')}
          </Button>
        </ActionGroup>
      </LayoutCard>
    </>
  )
}
