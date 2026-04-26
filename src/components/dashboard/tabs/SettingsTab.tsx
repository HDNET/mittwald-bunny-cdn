import {
  Alert,
  AlertText,
  Badge,
  Button,
  Content,
  ContextualHelp,
  ContextualHelpTrigger,
  FieldDescription,
  Flex,
  Heading,
  Label,
  LabeledValue,
  Link,
  Section,
  Segment,
  SegmentedControl,
  Separator,
  Switch,
  Text,
  TextArea,
} from '@mittwald/flow-remote-react-components'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applyPatch } from '~/components/shared/apply-patch'
import { useOptimisticSetting } from '~/components/shared/use-optimistic-setting'
import * as bunnyApi from '~/lib/bunny-cdn-api'
import { localizeError } from '~/lib/localize-error'
import type { CacheTtlSettings, HotlinkSettings, OptimizerSettings } from '~/shared/types'

interface Props {
  enabled: boolean
  euOnly: boolean
  hotlink: HotlinkSettings
  optimizer: OptimizerSettings
  cacheTtl: CacheTtlSettings
  smartCache: boolean
  onPatched: () => void
  onError: (message: string) => void
}

const CACHE_PRESETS: Array<{ id: 'origin' | '1h' | '1d' | '1w' | '30d'; seconds: number }> = [
  { id: 'origin', seconds: -1 },
  { id: '1h', seconds: 3600 },
  { id: '1d', seconds: 86_400 },
  { id: '1w', seconds: 604_800 },
  { id: '30d', seconds: 2_592_000 },
]

function presetIdFor(seconds: number): string {
  const exact = CACHE_PRESETS.find((p) => p.seconds === seconds)
  if (exact) return exact.id
  if (seconds < 0) return 'origin'
  return CACHE_PRESETS.reduce((best, p) =>
    Math.abs(p.seconds - seconds) < Math.abs(best.seconds - seconds) ? p : best,
  ).id
}

function secondsForPreset(id: string): number {
  return CACHE_PRESETS.find((p) => p.id === id)?.seconds ?? -1
}

function parseReferrers(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function SettingsTab({ enabled, euOnly, hotlink, optimizer, cacheTtl, smartCache, onPatched, onError }: Props) {
  const { t } = useTranslation()
  const opts = { onPatched, onError }

  // Auslieferung
  const [enabledLocal, setEnabledLocal] = useOptimisticSetting(
    enabled,
    (checked: boolean) => ({ enabled: checked }),
    opts,
  )
  const [edgeTtlPreset, setEdgeTtlPreset] = useOptimisticSetting(
    presetIdFor(cacheTtl.edge),
    (id: string) => ({ cacheTtl: { edge: secondsForPreset(id) } }),
    opts,
  )
  const [browserTtlPreset, setBrowserTtlPreset] = useOptimisticSetting(
    presetIdFor(cacheTtl.browser),
    (id: string) => ({ cacheTtl: { browser: secondsForPreset(id) } }),
    opts,
  )
  const [smart, setSmart] = useOptimisticSetting(smartCache, (checked: boolean) => ({ smartCache: checked }), opts)

  // Optimierung
  const [image, setImage] = useOptimisticSetting(
    optimizer.image,
    (checked: boolean) => ({ optimizer: { image: checked, webp: checked, avif: checked } }),
    opts,
  )
  const [cssMinify, setCssMinify] = useOptimisticSetting(
    optimizer.cssMinify,
    (checked: boolean) => ({ optimizer: { cssMinify: checked } }),
    opts,
  )
  const [jsMinify, setJsMinify] = useOptimisticSetting(
    optimizer.jsMinify,
    (checked: boolean) => ({ optimizer: { jsMinify: checked } }),
    opts,
  )

  // Zugriff
  const [euOnlyLocal, setEuOnlyLocal] = useOptimisticSetting(euOnly, (checked: boolean) => ({ euOnly: checked }), opts)
  const [hotlinkEditing, setHotlinkEditing] = useState(hotlink.enabled)
  const [referrers, setReferrers] = useState(hotlink.allowedReferrers.join('\n'))
  const parsedReferrers = parseReferrers(referrers)
  const hotlinkDirty =
    hotlinkEditing !== hotlink.enabled || parsedReferrers.join('\n') !== hotlink.allowedReferrers.join('\n')
  const hotlinkCanSave = !hotlinkEditing || parsedReferrers.length > 0

  function handleHotlinkToggle(checked: boolean) {
    setHotlinkEditing(checked)
    // Disabling is safe to persist immediately — empty allow-list = no restriction
    if (!checked && hotlink.enabled) {
      void applyPatch({ hotlink: { allowedReferrers: [] } }, onPatched, onError)
    }
  }

  function handleHotlinkSave() {
    void applyPatch({ hotlink: { allowedReferrers: hotlinkEditing ? parsedReferrers : [] } }, onPatched, onError)
  }

  return (
    <Flex direction="column" gap="m">
      {/* ─────────────────────────── AUSLIEFERUNG ─────────────────────────── */}
      <Heading>{t('dashboard.settingsTab.sections.delivery')}</Heading>

      <Section>
        <Heading>{t('dashboard.settingsTab.serving.heading')}</Heading>
        <Flex direction="column" gap="s">
          <Text>{t('dashboard.settingsTab.serving.description')}</Text>
          <Switch isSelected={enabledLocal} onChange={setEnabledLocal}>
            {t('dashboard.settingsTab.serving.toggle')}
          </Switch>
        </Flex>
      </Section>

      <PurgeCacheCard onError={onError} />

      <Section>
        <Heading>{t('dashboard.settingsTab.cacheTtl.heading')}</Heading>
        <Flex direction="column" gap="s">
          <Text>{t('dashboard.settingsTab.cacheTtl.description')}</Text>
          <LabeledValue>
            <Label>{t('dashboard.settingsTab.cacheTtl.edgeLabel')}</Label>
            <SegmentedControl value={edgeTtlPreset} onChange={(v) => setEdgeTtlPreset(String(v))}>
              {CACHE_PRESETS.map((p) => (
                <Segment key={p.id} value={p.id}>
                  {t(`dashboard.settingsTab.cachePresets.${p.id}`)}
                </Segment>
              ))}
            </SegmentedControl>
          </LabeledValue>
          <LabeledValue>
            <Label>{t('dashboard.settingsTab.cacheTtl.browserLabel')}</Label>
            <SegmentedControl value={browserTtlPreset} onChange={(v) => setBrowserTtlPreset(String(v))}>
              {CACHE_PRESETS.map((p) => (
                <Segment key={p.id} value={p.id}>
                  {t(`dashboard.settingsTab.cachePresets.${p.id}`)}
                </Segment>
              ))}
            </SegmentedControl>
          </LabeledValue>
        </Flex>
      </Section>

      <Section>
        <Heading>
          {t('dashboard.settingsTab.smartCache.heading')}
          <ContextualHelpTrigger>
            <ContextualHelp>
              <Heading>{t('dashboard.settingsTab.smartCache.helpHeading')}</Heading>
              <Content>
                <Text>{t('dashboard.settingsTab.smartCache.helpText')}</Text>
              </Content>
            </ContextualHelp>
          </ContextualHelpTrigger>
        </Heading>
        <Flex direction="column" gap="s">
          <Text>{t('dashboard.settingsTab.smartCache.description')}</Text>
          <Text>{t('dashboard.settingsTab.smartCache.recommendation')}</Text>
          <Text>
            <Link
              href="https://support.bunny.net/hc/en-us/articles/5779976842770-Understanding-Smart-Cache"
              target="_blank"
            >
              {t('dashboard.settingsTab.smartCache.docsLink')}
            </Link>
          </Text>
          <Switch isSelected={smart} onChange={setSmart}>
            {t('dashboard.settingsTab.smartCache.toggle')}
          </Switch>
        </Flex>
      </Section>

      <Separator />

      {/* ──────────────────────────── OPTIMIERUNG ─────────────────────────── */}
      <Heading>{t('dashboard.settingsTab.sections.optimization')}</Heading>

      <Section>
        <Heading>
          {t('dashboard.settingsTab.imageOptimizer.heading')}{' '}
          <Badge color="orange">{t('dashboard.settingsTab.imageOptimizer.badge')}</Badge>
        </Heading>
        <Flex direction="column" gap="s">
          <Text>{t('dashboard.settingsTab.imageOptimizer.description')}</Text>
          <Text>
            {t('dashboard.settingsTab.imageOptimizer.pricingPrefix')}
            <Link href="https://bunny.net/pricing/" target="_blank">
              {t('dashboard.settingsTab.imageOptimizer.pricingLink')}
            </Link>
            {t('dashboard.settingsTab.imageOptimizer.pricingSuffix')}
          </Text>
          <Switch isSelected={image} onChange={setImage}>
            {t('dashboard.settingsTab.imageOptimizer.toggle')}
          </Switch>
        </Flex>
      </Section>

      <Section>
        <Heading>{t('dashboard.settingsTab.minify.heading')}</Heading>
        <Flex direction="column" gap="s">
          <Text>{t('dashboard.settingsTab.minify.description')}</Text>
          <Switch isSelected={cssMinify} onChange={setCssMinify}>
            {t('dashboard.settingsTab.minify.css')}
          </Switch>
          <Switch isSelected={jsMinify} onChange={setJsMinify}>
            {t('dashboard.settingsTab.minify.js')}
          </Switch>
        </Flex>
      </Section>

      <Separator />

      {/* ───────────────────────────── ZUGRIFF ────────────────────────────── */}
      <Heading>{t('dashboard.settingsTab.sections.access')}</Heading>

      <Section>
        <Heading>{t('dashboard.settingsTab.cdnRegions.heading')}</Heading>
        <Flex direction="column" gap="s">
          <Text>{t('dashboard.settingsTab.cdnRegions.description')}</Text>
          <Text>
            {t('dashboard.settingsTab.cdnRegions.dpaHint')}{' '}
            <Link href="https://dash.bunny.net/account/dpa" target="_blank">
              {t('dashboard.settingsTab.cdnRegions.dpaLink')}
            </Link>
          </Text>
          <Switch isSelected={euOnlyLocal} onChange={setEuOnlyLocal}>
            {t('dashboard.settingsTab.cdnRegions.toggle')}
          </Switch>
        </Flex>
      </Section>

      <Section>
        <Heading>{t('dashboard.settingsTab.hotlink.heading')}</Heading>
        <Flex direction="column" gap="s">
          <Text>{t('dashboard.settingsTab.hotlink.description')}</Text>
          <Switch isSelected={hotlinkEditing} onChange={handleHotlinkToggle}>
            {t('dashboard.settingsTab.hotlink.toggle')}
          </Switch>
          {hotlinkEditing && (
            <>
              <TextArea value={referrers} onChange={setReferrers} rows={4}>
                <Label>{t('dashboard.settingsTab.hotlink.referrersLabel')}</Label>
                <FieldDescription>{t('dashboard.settingsTab.hotlink.referrersHelp')}</FieldDescription>
              </TextArea>
              {!hotlinkCanSave && (
                <Alert status="warning">
                  <AlertText>{t('dashboard.settingsTab.hotlink.emptyWarning')}</AlertText>
                </Alert>
              )}
              <Button isDisabled={!hotlinkDirty || !hotlinkCanSave} onPress={handleHotlinkSave}>
                {t('dashboard.settingsTab.hotlink.save')}
              </Button>
            </>
          )}
        </Flex>
      </Section>
    </Flex>
  )
}

function PurgeCacheCard({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation()
  const [purging, setPurging] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handlePurge() {
    setPurging(true)
    setSuccess(false)
    try {
      await bunnyApi.purgeCache()
      setSuccess(true)
    } catch (e) {
      onError(localizeError(e, t))
    } finally {
      setPurging(false)
    }
  }

  return (
    <Section>
      <Heading>{t('dashboard.settingsTab.purgeCache.heading')}</Heading>
      <Flex direction="column" gap="s">
        <Text>{t('dashboard.settingsTab.purgeCache.description')}</Text>
        <Button onPress={handlePurge} isDisabled={purging}>
          {purging ? t('dashboard.settingsTab.purgeCache.purging') : t('dashboard.settingsTab.purgeCache.button')}
        </Button>
        {success && (
          <Alert status="success" role="status">
            <AlertText>{t('dashboard.settingsTab.purgeCache.success')}</AlertText>
          </Alert>
        )}
      </Flex>
    </Section>
  )
}
