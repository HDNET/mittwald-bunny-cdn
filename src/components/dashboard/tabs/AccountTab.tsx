import {
  ActionGroup,
  Alert,
  AlertText,
  Button,
  Content,
  ContextualHelp,
  ContextualHelpTrigger,
  Flex,
  Heading,
  Label,
  Link,
  Section,
  Text,
  TextField,
} from '@mittwald/flow-remote-react-components'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { BunnyCdnGhost } from '~/ghosts'
import * as bunnyApi from '~/lib/bunny-cdn-api'
import { localizeError } from '~/lib/localize-error'
import { isBunnyApiKeyFormat } from '~/shared/validation'

interface Props {
  onPatched: () => void
  onError: (message: string) => void
  onDelete: () => Promise<void>
  onDetach: () => Promise<void>
}

export function AccountTab({ onPatched, onError, onDelete, onDetach }: Props) {
  const { t } = useTranslation()
  const apiKeyStatus = BunnyCdnGhost.getApiKeyStatus().use()

  const [newApiKey, setNewApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyMsg, setKeyMsg] = useState<string | null>(null)
  const trimmedKey = newApiKey.trim()
  const keyFormatInvalid = trimmedKey.length > 0 && !isBunnyApiKeyFormat(trimmedKey)
  const keySubmitDisabled = trimmedKey.length === 0 || keyFormatInvalid || savingKey
  const keyPlaceholder = apiKeyStatus?.last4
    ? t('dashboard.actions.changeApiKeyPlaceholder', { last4: apiKeyStatus.last4 })
    : t('wizard.step0.apiKey.placeholder')

  function handleApiKeyChange(value: string) {
    setNewApiKey(value)
    if (keyMsg) setKeyMsg(null)
  }

  async function handleSaveApiKey() {
    if (keySubmitDisabled) return
    setSavingKey(true)
    setKeyMsg(null)
    try {
      await bunnyApi.saveApiKey(trimmedKey)
      setKeyMsg(t('dashboard.actions.changeApiKeySuccess'))
      setNewApiKey('')
      onPatched()
    } catch (e) {
      onError(localizeError(e, t))
    } finally {
      setSavingKey(false)
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<'delete' | 'detach' | null>(null)

  async function handleDelete() {
    setBusy('delete')
    try {
      await onDelete()
    } finally {
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  async function handleDetach() {
    setBusy('detach')
    try {
      await onDetach()
    } finally {
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  return (
    <Flex direction="column" gap="m">
      <Section>
        <Heading>{t('dashboard.actions.changeApiKey')}</Heading>
        <Flex direction="column" gap="s">
          <Text>
            <Trans
              i18nKey="dashboard.actions.changeApiKeyDescription"
              components={{ 1: <Link href="https://dash.bunny.net/account/api-key" target="_blank" /> }}
            />
          </Text>
          <TextField
            type="password"
            value={newApiKey}
            onChange={handleApiKeyChange}
            placeholder={keyPlaceholder}
            isInvalid={keyFormatInvalid}
            isRequired
          >
            <Label>
              {t('dashboard.actions.changeApiKeyLabel')}
              <ContextualHelpTrigger>
                <ContextualHelp>
                  <Heading>{t('dashboard.actions.changeApiKeyHintHeading')}</Heading>
                  <Content>
                    <Text>{t('dashboard.actions.changeApiKeyHint')}</Text>
                  </Content>
                </ContextualHelp>
              </ContextualHelpTrigger>
            </Label>
          </TextField>
          {keyFormatInvalid && (
            <Alert status="danger" role="alert">
              <AlertText>{t('wizard.step0.apiKey.invalid')}</AlertText>
            </Alert>
          )}
          {keyMsg && (
            <Alert status="success" role="status">
              <AlertText>{keyMsg}</AlertText>
            </Alert>
          )}
          <Button onPress={handleSaveApiKey} isDisabled={keySubmitDisabled}>
            {savingKey ? `${t('common.actions.save')}…` : t('common.actions.save')}
          </Button>
        </Flex>
      </Section>

      <Section>
        <Heading>{t('dashboard.dangerZone.label')}</Heading>
        {!confirmDelete ? (
          <Flex direction="column" gap="s">
            <Text>{t('dashboard.dangerZone.description')}</Text>
            {/* @ts-expect-error — flow remote typing */}
            <Button variant="danger" onPress={() => setConfirmDelete(true)}>
              {t('dashboard.dangerZone.deleteCta')}
            </Button>
          </Flex>
        ) : (
          <Flex direction="column" gap="m">
            <Heading>{t('dashboard.dangerZone.confirmChoice')}</Heading>

            <Flex direction="column" gap="s">
              <Text>{t('dashboard.dangerZone.detachHint')}</Text>
              <Button variant="soft" color="secondary" onPress={handleDetach} isDisabled={busy !== null}>
                {busy === 'detach' ? t('dashboard.dangerZone.detaching') : t('dashboard.dangerZone.detachFinal')}
              </Button>
            </Flex>

            <Flex direction="column" gap="s">
              <Text>{t('dashboard.dangerZone.deleteHint')}</Text>
              {/* @ts-expect-error — flow remote typing */}
              <Button variant="danger" onPress={handleDelete} isDisabled={busy !== null}>
                {busy === 'delete' ? t('dashboard.dangerZone.deleting') : t('dashboard.dangerZone.deleteFinal')}
              </Button>
            </Flex>

            <ActionGroup>
              <Button
                variant="soft"
                color="secondary"
                onPress={() => setConfirmDelete(false)}
                isDisabled={busy !== null}
              >
                {t('common.actions.cancel')}
              </Button>
            </ActionGroup>
          </Flex>
        )}
      </Section>
    </Flex>
  )
}
