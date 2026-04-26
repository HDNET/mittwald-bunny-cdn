import { Badge, ColumnLayout, Content, LayoutCard, ProgressBar } from '@mittwald/flow-remote-react-components'
import { useTranslation } from 'react-i18next'

/**
 * i18n keys for every wizard step label, exported so `WizardShell` can ask
 * for `STEP_KEYS.length` to build the "Step N of M" title without hardcoding
 * the count in two places.
 */
export const STEP_KEYS = [
  'wizard.progress.apiKey',
  'wizard.progress.domain',
  'wizard.progress.mode',
  'wizard.progress.create',
  'wizard.progress.done',
] as const

export function WizardProgress({ step }: { step: number }) {
  const { t } = useTranslation()
  const progress = ((step + 1) / STEP_KEYS.length) * 100
  return (
    <LayoutCard>
      <Content>
        <ColumnLayout m={[1]} l={[1, 1, 1, 1, 1]}>
          {STEP_KEYS.map((key, i) => (
            <Badge key={key} color={i <= step ? 'blue' : undefined} aria-current={i === step ? 'step' : undefined}>
              {i + 1}. {t(key)}
            </Badge>
          ))}
        </ColumnLayout>
        <ProgressBar
          value={progress}
          aria-label={t('wizard.progress.aria', { current: step + 1, total: STEP_KEYS.length })}
        />
      </Content>
    </LayoutCard>
  )
}
