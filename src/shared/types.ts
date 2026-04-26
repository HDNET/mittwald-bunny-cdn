export type HealthStatus = 'ok' | 'pending' | 'missing' | 'slow' | 'down' | 'unknown'

export interface PullZoneHealth {
  ssl: HealthStatus
  dns: HealthStatus
  origin: HealthStatus
  originResponseMs: number | null
}

export interface OptimizerSettings {
  image: boolean
  webp: boolean
  avif: boolean
  cssMinify: boolean
  jsMinify: boolean
}

export interface CacheTtlSettings {
  edge: number
  browser: number
}

export interface HotlinkSettings {
  enabled: boolean
  allowedReferrers: string[]
}

export interface PullZoneStatsSeries {
  date: string
  value: number
}

export interface PullZoneStats {
  bandwidth: number
  requests: number
  cacheHitRate: number
  avgResponseTime: number
  balance: number
  monthlyCharges: number
  monthlyBandwidth: number
  series: {
    bandwidth: PullZoneStatsSeries[]
    requests: PullZoneStatsSeries[]
    cacheHitRate: PullZoneStatsSeries[]
  }
  topCountries: Array<{ country: string; bandwidth: number }>
  previous: { bandwidth: number; requests: number; cacheHitRate: number } | null
}

export interface SettingsPatch {
  enabled?: boolean
  optimizer?: Partial<OptimizerSettings>
  cacheTtl?: Partial<CacheTtlSettings>
  hotlink?: Partial<HotlinkSettings>
  smartCache?: boolean
  euOnly?: boolean
}

export interface PullZoneStatusResponse {
  exists: boolean
  /**
   * Mirrors `state.enabled` from the latest mittwald webhook. When `false`
   * the extension instance is paused in mStudio; mutations are blocked
   * server-side and the UI shows a pause banner.
   */
  extensionEnabled: boolean
  id?: number
  cdnDomain?: string
  originUrl?: string
  cdnMode?: 'asset' | 'full-site'
  /**
   * The hostname the user has under their own domain (`cdn.example.com` in
   * Asset-Mode, `www.example.com` in Full-Site-Mode). `null` means Asset-Mode
   * with the toggle off — the user only exposes `<pullzone>.b-cdn.net`. The
   * field is omitted entirely (`undefined`) on rows written before this
   * feature existed; treat `undefined` as "no custom hostname".
   */
  customHostname?: string | null
  enabled?: boolean
  euOnly?: boolean
  optimizer?: OptimizerSettings
  cacheTtl?: CacheTtlSettings
  hotlink?: HotlinkSettings
  smartCache?: boolean
  health?: PullZoneHealth
}

export interface DomainResponse {
  id: string
  hostname: string
}

// ─── Config Hints ──────────────────────────────────────────────────────────

export type ConfigHintStatus = 'ok' | 'pending' | 'info'

/**
 * `ConfigHint` carries **i18n keys plus interpolation values**, not
 * resolved strings. The Wizard's Step 4 owns the `t()` call and turns
 * the keys into UI text. This keeps `generateConfigHints` a pure logic
 * function (testable without i18next setup) and centralises all DE/EN
 * strings in `src/i18n/locales/*.json`.
 */
export interface ConfigHint {
  titleKey: string
  descriptionKey: string
  /** Substitutions for the `descriptionKey` template (`{{cdnDomain}}` etc.). */
  descriptionValues?: Record<string, string>
  /** Visual status badge next to the title. */
  status?: ConfigHintStatus
  /**
   * Substrings of the *resolved* description that the UI should render
   * inside `<InlineCode>` — typically hostnames and DNS targets. These
   * are still raw strings (not keys) because they are user data, not
   * translations.
   */
  highlights?: string[]
  code?: string
}

export interface ConfigHints {
  dns: ConfigHint
  typo3?: ConfigHint
  ssl?: ConfigHint
  cache?: ConfigHint
  redirect?: ConfigHint
}

export function generateConfigHints(pullZone: {
  cdnDomain: string
  originUrl: string
  cdnMode: 'asset' | 'full-site'
  hostname?: string
  dnsConfigured?: boolean
  /**
   * Asset mode: the custom hostname when the toggle was on; `null` means
   * the user deliberately opted out of the custom hostname and only gets
   * the `<pullzone>.b-cdn.net` URL.
   */
  customHostname?: string | null
}): ConfigHints {
  const cdnDomain = pullZone.cdnDomain

  const domain = extractDomain(pullZone.originUrl)
  const dnsOk = pullZone.dnsConfigured

  if (pullZone.cdnMode === 'asset') {
    // Toggle off — no custom hostname was registered. Point the user at the
    // plain .b-cdn.net URL; there's no DNS or SSL to configure.
    if (pullZone.customHostname === null) {
      const typo3Snippet = `page.config.absRefPrefix = https://${cdnDomain}/`
      return {
        dns: {
          titleKey: 'configHints.asset.noCustom.dns.title',
          descriptionKey: 'configHints.asset.noCustom.dns.description',
          descriptionValues: { cdnDomain },
          status: 'info',
          highlights: [cdnDomain],
        },
        typo3: {
          titleKey: 'configHints.asset.typo3.title',
          descriptionKey: 'configHints.asset.typo3.description',
          status: 'info',
          code: typo3Snippet,
        },
      }
    }

    const cdnSubdomain = pullZone.customHostname ?? `cdn.${domain}`
    const typo3Snippet = `page.config.absRefPrefix = https://${cdnSubdomain}/`
    return {
      dns: dnsOk
        ? {
            titleKey: 'configHints.asset.withCustom.dnsOk.title',
            descriptionKey: 'configHints.asset.withCustom.dnsOk.description',
            descriptionValues: { subdomain: cdnSubdomain, cdnDomain },
            status: 'ok',
            highlights: [cdnSubdomain, cdnDomain],
          }
        : {
            titleKey: 'configHints.asset.withCustom.dnsPending.title',
            descriptionKey: 'configHints.asset.withCustom.dnsPending.description',
            status: 'pending',
            code: `${cdnSubdomain}  CNAME  ${cdnDomain}`,
          },
      typo3: {
        titleKey: 'configHints.asset.typo3.title',
        descriptionKey: 'configHints.asset.typo3.description',
        status: 'info',
        code: typo3Snippet,
      },
    }
  }

  // Full-site CDN
  const hostname = pullZone.hostname ?? extractDomain(pullZone.originUrl)
  const nakedDomain = hostname.replace(/^www\./, '')
  return {
    dns: dnsOk
      ? {
          titleKey: 'configHints.fullSite.dnsOk.title',
          descriptionKey: 'configHints.fullSite.dnsOk.description',
          descriptionValues: { hostname, cdnDomain },
          status: 'ok',
          highlights: [hostname, cdnDomain],
        }
      : {
          titleKey: 'configHints.fullSite.dnsPending.title',
          descriptionKey: 'configHints.fullSite.dnsPending.description',
          status: 'pending',
          code: `${hostname}  CNAME  ${cdnDomain}`,
        },
    ssl: {
      titleKey: 'configHints.fullSite.ssl.title',
      descriptionKey: 'configHints.fullSite.ssl.description',
      descriptionValues: { hostname },
      status: 'pending',
      highlights: [hostname],
    },
    cache: {
      titleKey: 'configHints.fullSite.cache.title',
      descriptionKey: 'configHints.fullSite.cache.description',
      status: 'info',
    },
    redirect:
      hostname !== nakedDomain
        ? {
            titleKey: 'configHints.fullSite.redirect.title',
            descriptionKey: 'configHints.fullSite.redirect.description',
            descriptionValues: { nakedDomain, hostname },
            status: 'pending',
            highlights: [nakedDomain, hostname],
          }
        : undefined,
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}
