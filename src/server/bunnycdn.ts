import { promises as dnsPromises } from 'node:dns'
import { createLogger } from '~/server/logger.js'
import { createAppError, ErrorType, isAppError } from '~/shared/errors.js'

const log = createLogger('bunnycdn')

const BASE_URL = 'https://api.bunny.net'
const TIMEOUT_MS = 30_000

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreatePullZoneParams {
  name: string
  originUrl: string
  apiKey: string
}

export interface PullZoneResult {
  id: number
  name: string
  cdnDomain: string
}

export interface PullZoneInfo {
  id: number
  name: string
  cdnDomain: string
  originUrl: string
  enabled: boolean
  enableGeoZoneEU: boolean
  enableGeoZoneUS: boolean
  enableGeoZoneASIA: boolean
  enableGeoZoneSA: boolean
  enableGeoZoneAF: boolean
  hostnames: Array<{ value: string; hasCertificate: boolean }>
  optimizer: {
    image: boolean
    webp: boolean
    avif: boolean
    cssMinify: boolean
    jsMinify: boolean
  }
  cacheTtl: {
    edge: number
    browser: number
  }
  hotlink: {
    enabled: boolean
    allowedReferrers: string[]
  }
  smartCache: boolean
}

export interface PullZoneSettingsPatch {
  enabled?: boolean
  optimizer?: Partial<PullZoneInfo['optimizer']>
  cacheTtl?: Partial<PullZoneInfo['cacheTtl']>
  hotlink?: Partial<PullZoneInfo['hotlink']>
  smartCache?: boolean
}

export interface OriginHealth {
  status: 'ok' | 'slow' | 'down' | 'unknown'
  responseMs: number | null
}

export interface EdgeRuleTrigger {
  type: number
  patternMatches: string[]
  patternMatchingType: number
}

export interface EdgeRule {
  actionType: number
  triggers: EdgeRuleTrigger[]
  description: string
  enabled: boolean
}

// ─── HTTP Client ────────────────────────────────────────────────────────────

function redactApiKey(key: string): string {
  if (key.length <= 8) return '[REDACTED]'
  return `${key.slice(0, 4)}...[REDACTED]`
}

export async function bunnyFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        AccessKey: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    })
    return response
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createAppError(ErrorType.NETWORK_ERROR, 'BunnyCDN API Timeout.', {
        details: `Request to ${path} timed out after ${TIMEOUT_MS}ms`,
        retryable: true,
        code: 'BUNNY_TIMEOUT',
      })
    }
    throw createAppError(ErrorType.NETWORK_ERROR, 'BunnyCDN API nicht erreichbar.', {
      details: `Request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      retryable: true,
      code: 'BUNNY_UNREACHABLE',
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function bunnyRequest<T>(path: string, apiKey: string, options: RequestInit = {}): Promise<T> {
  const response = await bunnyFetch(path, apiKey, options)

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    if (response.status === 401) {
      throw createAppError(ErrorType.BUNNY_API_ERROR, 'Ungültiger BunnyCDN API Key.', {
        details: `HTTP 401 on ${path}`,
        retryable: false,
        code: 'BUNNY_UNAUTHORIZED',
      })
    }
    if (response.status === 404) {
      throw createAppError(ErrorType.NOT_FOUND, 'Ressource nicht gefunden.', {
        details: `HTTP 404 on ${path}`,
        retryable: false,
        code: 'BUNNY_NOT_FOUND',
      })
    }
    throw createAppError(ErrorType.BUNNY_API_ERROR, `BunnyCDN API Fehler (HTTP ${response.status}).`, {
      details: `${options.method ?? 'GET'} ${path}: ${errorBody}`,
      retryable: response.status >= 500,
      code: 'BUNNY_API_ERROR',
      variables: { status: response.status },
    })
  }

  // Several bunny endpoints (purgeCache, addEdgeRule, …) return an empty body
  // on success, so we cannot blindly call response.json() here.
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

// ─── API Key Validation ─────────────────────────────────────────────────────

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await bunnyFetch('/apikey', apiKey)
    return response.ok
  } catch {
    return false
  }
}

// ─── Pull Zone CRUD ─────────────────────────────────────────────────────────

export async function createPullZone(params: CreatePullZoneParams): Promise<PullZoneResult> {
  log.info(
    `[bunnycdn] Creating pull zone "${params.name}" with origin ${params.originUrl} (apiKey: ${redactApiKey(params.apiKey)})`,
  )

  const data = await bunnyRequest<{
    Id: number
    Name: string
    Hostnames: Array<{ Value: string }>
  }>('/pullzone', params.apiKey, {
    method: 'POST',
    body: JSON.stringify({
      Name: params.name,
      OriginUrl: params.originUrl,
    }),
  })

  const cdnHostname = data.Hostnames?.find((h) => h.Value.endsWith('.b-cdn.net'))

  return {
    id: data.Id,
    name: data.Name,
    cdnDomain: cdnHostname?.Value ?? `${data.Name}.b-cdn.net`,
  }
}

export async function deletePullZone(pullZoneId: number, apiKey: string): Promise<void> {
  log.info(`Deleting pull zone ${pullZoneId} (apiKey: ${redactApiKey(apiKey)})`)

  const response = await bunnyFetch(`/pullzone/${pullZoneId}`, apiKey, {
    method: 'DELETE',
  })

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text().catch(() => '')
    throw createAppError(
      ErrorType.BUNNY_API_ERROR,
      `Pull Zone konnte nicht gelöscht werden (HTTP ${response.status}).`,
      {
        details: errorBody,
        retryable: response.status >= 500,
        code: 'PULL_ZONE_DELETE_FAILED',
        variables: { status: response.status },
      },
    )
  }
}

interface BunnyPullZoneRaw {
  Id: number
  Name: string
  Hostnames: Array<{ Value: string; HasCertificate?: boolean }>
  OriginUrl: string
  Enabled: boolean
  EnableGeoZoneEU: boolean
  EnableGeoZoneUS: boolean
  EnableGeoZoneASIA: boolean
  EnableGeoZoneSA: boolean
  EnableGeoZoneAF: boolean
  EnableImageOptimizer?: boolean
  EnableWebPVary?: boolean
  EnableAvifVary?: boolean
  OptimizerMinifyCSS?: boolean
  OptimizerMinifyJavaScript?: boolean
  CacheControlMaxAgeOverride?: number
  CacheControlBrowserMaxAgeOverride?: number
  BlockedReferrers?: string[]
  AllowedReferrers?: string[]
  EnableCacheSlice?: boolean
}

function mapPullZone(data: BunnyPullZoneRaw): PullZoneInfo {
  const cdnHostname = data.Hostnames?.find((h) => h.Value.endsWith('.b-cdn.net'))
  return {
    id: data.Id,
    name: data.Name,
    cdnDomain: cdnHostname?.Value ?? `${data.Name}.b-cdn.net`,
    originUrl: data.OriginUrl,
    enabled: data.Enabled,
    enableGeoZoneEU: data.EnableGeoZoneEU,
    enableGeoZoneUS: data.EnableGeoZoneUS,
    enableGeoZoneASIA: data.EnableGeoZoneASIA,
    enableGeoZoneSA: data.EnableGeoZoneSA,
    enableGeoZoneAF: data.EnableGeoZoneAF,
    hostnames: (data.Hostnames ?? []).map((h) => ({
      value: h.Value,
      hasCertificate: h.HasCertificate ?? false,
    })),
    optimizer: {
      image: data.EnableImageOptimizer ?? false,
      webp: data.EnableWebPVary ?? false,
      avif: data.EnableAvifVary ?? false,
      cssMinify: data.OptimizerMinifyCSS ?? false,
      jsMinify: data.OptimizerMinifyJavaScript ?? false,
    },
    cacheTtl: {
      edge: data.CacheControlMaxAgeOverride ?? -1,
      browser: data.CacheControlBrowserMaxAgeOverride ?? -1,
    },
    hotlink: {
      enabled: (data.AllowedReferrers?.length ?? 0) > 0 || (data.BlockedReferrers?.length ?? 0) > 0,
      allowedReferrers: data.AllowedReferrers ?? [],
    },
    smartCache: data.EnableCacheSlice ?? false,
  }
}

export async function getPullZone(pullZoneId: number, apiKey: string): Promise<PullZoneInfo | null> {
  try {
    const data = await bunnyRequest<BunnyPullZoneRaw>(`/pullzone/${pullZoneId}`, apiKey)
    return mapPullZone(data)
  } catch (error) {
    if (isAppError(error) && error.type === ErrorType.NOT_FOUND) {
      return null
    }
    throw error
  }
}

export async function purgeCache(pullZoneId: number, apiKey: string): Promise<void> {
  log.info(`Purging cache for pull zone ${pullZoneId} (apiKey: ${redactApiKey(apiKey)})`)

  await bunnyRequest(`/pullzone/${pullZoneId}/purgeCache`, apiKey, {
    method: 'POST',
  })
}

// ─── TYPO3 Edge Rules & SSL (Task 5.3) ─────────────────────────────────────

export async function addEdgeRule(pullZoneId: number, rule: EdgeRule, apiKey: string): Promise<void> {
  log.info(`Adding edge rule "${rule.description}" to pull zone ${pullZoneId}`)

  await bunnyRequest(`/pullzone/${pullZoneId}/edgerules/addOrUpdate`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      ActionType: rule.actionType,
      Triggers: rule.triggers.map((t) => ({
        Type: t.type,
        PatternMatches: t.patternMatches,
        PatternMatchingType: t.patternMatchingType,
      })),
      Description: rule.description,
      Enabled: rule.enabled,
    }),
  })
}

export async function addHostname(pullZoneId: number, hostname: string, apiKey: string): Promise<void> {
  log.info(`Adding hostname "${hostname}" to pull zone ${pullZoneId}`)

  const response = await bunnyFetch('/pullzone/addHostname', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      PullZoneId: pullZoneId,
      Hostname: hostname,
    }),
  })

  if (response.ok) return

  // Treat "already registered" as success — makes the call idempotent
  // so retries and re-enabling a custom hostname that still exists at
  // bunny.net don't fail.
  if (response.status === 400) {
    const body = await response.text().catch(() => '')
    if (body.includes('hostname_already_registered')) {
      log.info(`Hostname "${hostname}" already registered on pull zone ${pullZoneId} — treating as success`)
      return
    }
  }

  const errorBody = await response.text().catch(() => '')
  throw createAppError(ErrorType.BUNNY_API_ERROR, `bunny.net API Fehler (HTTP ${response.status}).`, {
    details: `POST /pullzone/addHostname: ${errorBody}`,
    retryable: response.status >= 500,
    code: 'BUNNY_API_ERROR',
    variables: { status: response.status },
  })
}

export async function removeHostname(pullZoneId: number, hostname: string, apiKey: string): Promise<void> {
  log.info(`Removing hostname "${hostname}" from pull zone ${pullZoneId}`)

  // bunny.net answers with 400 if the hostname isn't registered — we treat
  // that as a no-op so the caller can reach an idempotent end state even if
  // state drifted between our DB and bunny.
  const response = await bunnyFetch('/pullzone/removeHostname', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      PullZoneId: pullZoneId,
      Hostname: hostname,
    }),
  })
  if (!response.ok && response.status !== 400 && response.status !== 404) {
    const errorBody = await response.text().catch(() => '')
    throw createAppError(
      ErrorType.BUNNY_API_ERROR,
      `Hostname konnte nicht entfernt werden (HTTP ${response.status}).`,
      {
        details: errorBody,
        retryable: response.status >= 500,
        code: 'HOSTNAME_REMOVE_FAILED',
        variables: { status: response.status },
      },
    )
  }
}

export async function enableFreeSsl(pullZoneId: number, hostname: string, apiKey: string): Promise<void> {
  log.info(`Enabling free SSL for "${hostname}" on pull zone ${pullZoneId}`)

  await bunnyFetch(`/pullzone/loadFreeCertificate?hostname=${encodeURIComponent(hostname)}`, apiKey)
}

/**
 * Creates a TYPO3-specific edge rule that disables caching when the
 * fe_typo_user cookie is set (logged-in frontend users).
 */
export function createTypo3CookieEdgeRule(): EdgeRule {
  return {
    actionType: 15, // DisableCaching
    triggers: [
      {
        type: 3, // Cookie
        patternMatches: ['fe_typo_user=*'],
        patternMatchingType: 0, // MatchAny
      },
    ],
    description: 'TYPO3: Disable caching for logged-in frontend users',
    enabled: true,
  }
}

/**
 * Sets up a pull zone for full-site CDN mode with TYPO3 edge rules,
 * custom hostname, and free SSL.
 */
export async function setupFullSiteCdn(pullZoneId: number, hostname: string, apiKey: string): Promise<void> {
  await addEdgeRule(pullZoneId, createTypo3CookieEdgeRule(), apiKey)
  await addHostname(pullZoneId, hostname, apiKey)
  await enableFreeSsl(pullZoneId, hostname, apiKey)
}

/**
 * Enforce EU-only data residency on the pull zone.
 *
 * Two Bunny mechanisms apply in parallel:
 * - Geo Zones (EnableGeoZone*): which PoPs may serve cached content.
 * - Routing Filters (RoutingFilters): which PoPs requests are even routed to.
 *
 * Geo Zones alone are not sufficient for GDPR: a US visitor would still be
 * routed to a US PoP, miss the cache, and the fetch would travel via US
 * infrastructure. Setting RoutingFilters to ["eu"] forces every visitor to
 * an EU PoP first, so no request ever traverses non-EU datacenters. The
 * trade-off is slightly higher latency for non-EU visitors.
 *
 * When euOnly is false we clear the routing filter and re-enable every geo
 * zone, returning the pull zone to the default global configuration.
 */
export async function setEuMode(pullZoneId: number, euOnly: boolean, apiKey: string): Promise<void> {
  log.info(`Setting EU mode for pull zone ${pullZoneId} (euOnly: ${euOnly})`)

  await bunnyRequest(`/pullzone/${pullZoneId}`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      EnableGeoZoneEU: true,
      EnableGeoZoneUS: !euOnly,
      EnableGeoZoneASIA: !euOnly,
      EnableGeoZoneSA: !euOnly,
      EnableGeoZoneAF: !euOnly,
      RoutingFilters: euOnly ? ['eu'] : [],
    }),
  })
}

// ─── Pull Zone Settings ─────────────────────────────────────────────────────

const OPTIMIZER_FIELD_MAP: Record<keyof PullZoneInfo['optimizer'], string> = {
  image: 'EnableImageOptimizer',
  webp: 'EnableWebPVary',
  avif: 'EnableAvifVary',
  cssMinify: 'OptimizerMinifyCSS',
  jsMinify: 'OptimizerMinifyJavaScript',
}

const CACHE_TTL_FIELD_MAP: Record<keyof PullZoneInfo['cacheTtl'], string> = {
  edge: 'CacheControlMaxAgeOverride',
  browser: 'CacheControlBrowserMaxAgeOverride',
}

function copyDefined<T extends object>(
  source: Partial<T> | undefined,
  fieldMap: Record<keyof T, string>,
  target: Record<string, unknown>,
): void {
  if (!source) return
  for (const [key, bunnyField] of Object.entries(fieldMap) as Array<[keyof T, string]>) {
    const value = source[key]
    if (value !== undefined) target[bunnyField] = value
  }
}

function settingsPatchToBunnyPayload(patch: PullZoneSettingsPatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (patch.enabled !== undefined) payload.Enabled = patch.enabled
  if (patch.smartCache !== undefined) payload.EnableCacheSlice = patch.smartCache
  if (patch.hotlink?.allowedReferrers !== undefined) payload.AllowedReferrers = patch.hotlink.allowedReferrers
  copyDefined(patch.optimizer, OPTIMIZER_FIELD_MAP, payload)
  copyDefined(patch.cacheTtl, CACHE_TTL_FIELD_MAP, payload)
  return payload
}

/**
 * Generic partial-update endpoint. Maps our typed patch to BunnyCDN's PascalCase fields.
 */
export async function updatePullZoneSettings(
  pullZoneId: number,
  patch: PullZoneSettingsPatch,
  apiKey: string,
): Promise<void> {
  const payload = settingsPatchToBunnyPayload(patch)
  if (Object.keys(payload).length === 0) return

  log.info(`Updating pull zone ${pullZoneId} settings: ${Object.keys(payload).join(', ')}`)
  await bunnyRequest(`/pullzone/${pullZoneId}`, apiKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ─── Health Checks ──────────────────────────────────────────────────────────

const ORIGIN_PING_TIMEOUT_MS = 3_000
const ORIGIN_SLOW_THRESHOLD_MS = 1_000

/**
 * Checks whether the given FQDN resolves to a CNAME matching `expected` (e.g. `xyz.b-cdn.net`).
 * Returns true if the CNAME chain contains the expected target, false on NXDOMAIN/mismatch.
 */
export async function checkDnsCname(fqdn: string, expected: string): Promise<boolean> {
  try {
    const records = await dnsPromises.resolveCname(fqdn)
    return records.some((r) => r.toLowerCase() === expected.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Checks whether an IPv4 or IPv6 address is in a private, loopback, link-local,
 * unique-local, CGNAT, multicast, or other non-public range.
 * Used as an SSRF guard: we refuse to ping any host that resolves to such an address.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  // IPv4 patterns (ordered by range)
  if (/^10\./.test(ip)) return true
  if (/^127\./.test(ip)) return true
  if (/^169\.254\./.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true // CGNAT 100.64/10
  if (/^0\./.test(ip)) return true // "this" network
  if (/^(22[4-9]|23\d)\./.test(ip)) return true // multicast 224-239
  if (/^(24\d|25[0-5])\./.test(ip)) return true // reserved 240-255
  // IPv6
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (/^fe[89ab]/.test(lower)) return true // link-local fe80::/10
  if (/^f[cd]/.test(lower)) return true // unique local fc00::/7
  if (/^ff/.test(lower)) return true // multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — extract and recurse
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (v4Mapped) return isPrivateOrReservedIp(v4Mapped[1])
  return false
}

/**
 * HEAD-pings the origin URL to determine availability and response time.
 *
 * SSRF hardening:
 * - Only https allowed
 * - Hostname is resolved first; requests to private/reserved IPs are refused
 * - Redirects are not followed (would re-open the SSRF vector)
 *
 * Returns 'slow' if > 1s, 'down' on error/timeout/blocked, 'ok' otherwise.
 */
export async function pingOrigin(originUrl: string): Promise<OriginHealth> {
  let parsed: URL
  try {
    parsed = new URL(originUrl)
  } catch {
    return { status: 'down', responseMs: null }
  }

  if (parsed.protocol !== 'https:') {
    log.warn(`pingOrigin: rejecting non-https origin ${parsed.protocol}//...`)
    return { status: 'down', responseMs: null }
  }

  try {
    // Resolve every A/AAAA record, not just one. A round-robin DNS that
    // returns a public address on the first lookup and a private one on the
    // second (used by `fetch` below) would otherwise sneak past this guard.
    const addresses = await dnsPromises.lookup(parsed.hostname, { all: true })
    if (addresses.length === 0) return { status: 'down', responseMs: null }
    const blocked = addresses.find((a) => isPrivateOrReservedIp(a.address))
    if (blocked) {
      log.warn(`pingOrigin: rejecting private/reserved host ${parsed.hostname} → ${blocked.address}`)
      return { status: 'down', responseMs: null }
    }
  } catch {
    return { status: 'down', responseMs: null }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ORIGIN_PING_TIMEOUT_MS)
  const start = Date.now()

  try {
    const response = await fetch(parsed.toString(), {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
    })
    const responseMs = Date.now() - start
    if (!response) return { status: 'down', responseMs: null }
    return {
      status: responseMs > ORIGIN_SLOW_THRESHOLD_MS ? 'slow' : 'ok',
      responseMs,
    }
  } catch {
    return { status: 'down', responseMs: null }
  } finally {
    clearTimeout(timeout)
  }
}
