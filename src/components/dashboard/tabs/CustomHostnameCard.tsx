import {
  ActionGroup,
  Alert,
  AlertText,
  Button,
  Content,
  Flex,
  Heading,
  InlineCode,
  Link,
  OverlayContent,
  Section,
  Switch,
  Text,
} from '@mittwald/flow-remote-react-components'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import * as bunnyApi from '~/lib/bunny-cdn-api'
import { localizeError } from '~/lib/localize-error'

interface Props {
  cdnMode: 'asset' | 'full-site'
  customHostname: string | null | undefined
  /** mittwald project domain, derived from the pull-zone origin. */
  domain: string
  cdnDomain: string
  onPatched: () => void
  onError: (message: string) => void
}

export function CustomHostnameCard({ cdnMode, customHostname, domain, cdnDomain, onPatched, onError }: Props) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  const isEnabled = !!customHostname
  const targetHostname = customHostname ?? `cdn.${domain}`

  // Full-site pull zones always have a custom hostname (www.<domain>) by
  // design — there is nothing to toggle, so we render a status readout
  // instead of a switch.
  if (cdnMode === 'full-site') {
    return (
      <Section>
        <Heading>{t('dashboard.integrationTab.customHostname.heading')}</Heading>
        <Text>
          <Trans
            i18nKey="dashboard.integrationTab.customHostname.fullSiteOnly"
            values={{ hostname: customHostname ?? `www.${domain}` }}
            components={{ 1: <InlineCode /> }}
          />
        </Text>
      </Section>
    )
  }

  async function applyToggle(nextEnabled: boolean) {
    setBusy(true)
    try {
      if (nextEnabled) {
        await bunnyApi.addCustomHostname(domain)
      } else {
        await bunnyApi.removeCustomHostname()
      }
      onPatched()
    } catch (e) {
      onError(localizeError(e, t) || t('dashboard.integrationTab.customHostname.error'))
    } finally {
      setBusy(false)
    }
  }

  function handleToggle(nextEnabled: boolean) {
    if (busy) return
    // Disabling the custom hostname makes the domain unreachable until
    // visitors switch to the .b-cdn.net URL. The Switch is controlled by
    // `customHostname`, so it visually springs back to "on" until the API
    // call lands — which means we can open the confirmation modal and
    // await the user's decision without flicker.
    if (!nextEnabled) {
      setConfirmingDisable(true)
      return
    }
    void applyToggle(true)
  }

  function handleConfirmDisable() {
    setConfirmingDisable(false)
    void applyToggle(false)
  }

  return (
    <Section>
      <Heading>{t('dashboard.integrationTab.customHostname.heading')}</Heading>
      <Flex direction="column" gap="s">
        <Text>
          {isEnabled ? (
            <Trans
              i18nKey="dashboard.integrationTab.customHostname.enabledText"
              values={{ hostname: targetHostname, cdnDomain }}
              components={{ 1: <InlineCode /> }}
            />
          ) : (
            <Trans
              i18nKey="dashboard.integrationTab.customHostname.disabledText"
              values={{ hostname: targetHostname, cdnDomain }}
              components={{ 1: <InlineCode /> }}
            />
          )}
        </Text>
        <Switch isSelected={isEnabled} onChange={handleToggle} isDisabled={busy}>
          {t('dashboard.integrationTab.customHostname.toggle')}
        </Switch>
        {busy && (
          <Alert status="info" role="status">
            <AlertText>{t('dashboard.integrationTab.customHostname.busy')}</AlertText>
          </Alert>
        )}
        {isEnabled && (
          <Link href={`https://${targetHostname}`} target="_blank">
            {t('dashboard.integrationTab.customHostname.openLink', { hostname: targetHostname })}
          </Link>
        )}
      </Flex>
      <OverlayContent isOpen={confirmingDisable} onOpenChange={setConfirmingDisable}>
        <Heading>{t('dashboard.integrationTab.customHostname.confirmDisableHeading')}</Heading>
        <Content>
          <Text>{t('dashboard.integrationTab.customHostname.confirmDisable')}</Text>
          <ActionGroup>
            <Button variant="soft" color="secondary" onPress={() => setConfirmingDisable(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button color="danger" onPress={handleConfirmDisable}>
              {t('dashboard.integrationTab.customHostname.confirmDisableCta')}
            </Button>
          </ActionGroup>
        </Content>
      </OverlayContent>
    </Section>
  )
}
