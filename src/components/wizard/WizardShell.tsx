import { Alert, AlertText, Button, Content, Flex, LayoutCard } from '@mittwald/flow-remote-react-components'
import { Title } from '@mittwald/mstudio-ext-react-components'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as bunnyApi from '~/lib/bunny-cdn-api'
import { localizeError } from '~/lib/localize-error'
import { type ConfigHints, type DomainResponse, generateConfigHints } from '~/shared/types'
import { PermissionBanner } from './PermissionBanner'
import { Step0ApiKey } from './Step0ApiKey'
import { Step1Domain } from './Step1Domain'
import { Step2Mode } from './Step2Mode'
import { Step3Confirm } from './Step3Confirm'
import { Step4Done } from './Step4Done'
import { STEP_KEYS, WizardProgress } from './WizardProgress'

interface Props {
  initialStep: number
  onComplete: () => void
}

export function WizardShell({ initialStep, onComplete }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState(initialStep)
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [selectedDomain, setSelectedDomain] = useState<DomainResponse | null>(null)
  const [cdnMode, setCdnMode] = useState<'asset' | 'full-site'>('asset')
  const [customHostnameEnabled, setCustomHostnameEnabled] = useState(true)
  const [creating, setCreating] = useState(false)
  const [hints, setHints] = useState<ConfigHints | null>(null)
  const [defaultOrigin, setDefaultOrigin] = useState<string | null>(null)

  async function handleSaveKey() {
    setError('')
    try {
      await bunnyApi.saveApiKey(apiKey)
      setStep(1)
    } catch (e) {
      setError(localizeError(e, t) || t('wizard.errors.saveFailed'))
    }
  }

  function handleReset() {
    setError('')
    setStep(0)
    setApiKey('')
    setSelectedDomain(null)
    setCdnMode('asset')
    setCustomHostnameEnabled(true)
  }

  async function handleResetApiKey() {
    // Drop the stored API key so Step 0 is shown again instead of Step 1 on
    // the next render; without this the app shell would bounce us back into
    // the failing domain fetch.
    try {
      await bunnyApi.deleteApiKey()
    } catch (e) {
      // Non-fatal: if the delete call itself fails we still want to drop the
      // user back to Step 0 so they can type a fresh key.
      console.warn('[wizard] deleteApiKey failed during reset:', e instanceof Error ? e.message : e)
    }
    handleReset()
    // Invalidate the app-shell ghosts so a remount picks initialStep=0.
    onComplete()
  }

  function getOriginUrl(): string | null {
    if (cdnMode === 'full-site') return defaultOrigin
    return selectedDomain ? `https://${selectedDomain.hostname}` : null
  }

  function getCdnHostname(): string | undefined {
    if (cdnMode !== 'full-site' || !selectedDomain) return undefined
    return selectedDomain.hostname.startsWith('www.') ? selectedDomain.hostname : `www.${selectedDomain.hostname}`
  }

  async function handleCreate() {
    if (!selectedDomain) return
    setCreating(true)
    setError('')
    try {
      const originUrl = getOriginUrl()
      if (!originUrl) {
        setError(t('wizard.errors.fullSiteOriginMissing'))
        setCreating(false)
        return
      }

      const result = await bunnyApi.createPullZone({
        name: selectedDomain.hostname.replace(/[^a-zA-Z0-9]/g, ''),
        originUrl,
        cdnMode,
        hostname: getCdnHostname(),
        domain: selectedDomain.hostname,
        customHostnameEnabled,
      })
      setHints(
        generateConfigHints({
          cdnDomain: result.cdnDomain,
          originUrl: result.originUrl,
          cdnMode,
          hostname: getCdnHostname() ?? selectedDomain.hostname,
          dnsConfigured: result.dnsConfigured,
          customHostname: result.customHostname,
        }),
      )
      setStep(4)
    } catch (e) {
      setError(localizeError(e, t) || t('wizard.errors.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <Title>{t('wizard.title', { current: step + 1, total: STEP_KEYS.length })}</Title>

      <Flex direction="column" gap="m">
        <WizardProgress step={step} />

        {step >= 1 && step <= 3 && <PermissionBanner />}

        {error && (
          <LayoutCard>
            <Alert status="danger" role="alert">
              <AlertText>{error}</AlertText>
            </Alert>
            <Content>
              <Button variant="soft" color="secondary" onPress={handleReset}>
                {t('common.actions.backToStart')}
              </Button>
            </Content>
          </LayoutCard>
        )}

        {step === 0 && <Step0ApiKey apiKey={apiKey} onApiKeyChange={setApiKey} onNext={handleSaveKey} />}

        {step === 1 && (
          <Step1Domain
            selectedDomain={selectedDomain}
            onSelect={setSelectedDomain}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
            onSetOrigin={setDefaultOrigin}
            onResetApiKey={handleResetApiKey}
          />
        )}

        {step === 2 && (
          <Step2Mode
            selectedDomain={selectedDomain}
            cdnMode={cdnMode}
            defaultOrigin={defaultOrigin}
            customHostnameEnabled={customHostnameEnabled}
            onCdnModeChange={setCdnMode}
            onCustomHostnameEnabledChange={setCustomHostnameEnabled}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <Step3Confirm
            selectedDomain={selectedDomain}
            cdnMode={cdnMode}
            defaultOrigin={defaultOrigin}
            customHostnameEnabled={customHostnameEnabled}
            creating={creating}
            onCreate={handleCreate}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && hints && <Step4Done hints={hints} onComplete={onComplete} />}
      </Flex>
    </>
  )
}
