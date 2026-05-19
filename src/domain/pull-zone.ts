import { eq } from 'drizzle-orm'
import * as bunny from '~/server/bunnycdn'
import { decrypt } from '~/server/crypto'
import type { AppDatabase } from '~/server/db/index'
import { extensionInstances, pullZones } from '~/server/db/schema'
import { createLogger } from '~/server/logger.js'
import { createAppError, ErrorType } from '~/shared/errors'

const log = createLogger('domain')

export interface CreatePullZoneInput {
  name: string
  originUrl: string
  cdnMode: 'asset' | 'full-site'
  /** Full-site mode: the `www.<domain>` hostname that is registered at bunny.net. */
  hostname?: string
  /** Project base domain, e.g. `example.com`. Required for auto-DNS and the custom hostname. */
  domain?: string
  /**
   * Asset mode: enables the custom-hostname chain (cdn.<domain> ↔ bunny.net addHostname ↔ free SSL).
   * Full-site mode ignores this flag — there the hostname is conceptually part of the mode.
   * Default `true`: without a custom hostname the auto-DNS step is pointless in asset mode, because
   * bunny.net cannot issue TLS without a registered hostname.
   */
  customHostnameEnabled?: boolean
  euOnly?: boolean
}

export interface CreatePullZoneResult {
  id: number
  cdnDomain: string
  originUrl: string
  cdnMode: string
  dnsConfigured: boolean
  customHostname: string | null
}

export interface DnsClient {
  listZones(projectId: string): Promise<Array<{ id: string; domain: string }>>
  createZone(name: string, parentZoneId: string): Promise<{ id: string }>
  setCname(zoneId: string, fqdn: string): Promise<boolean>
  clearCname?(zoneId: string): Promise<boolean>
}

async function configureDnsCname(
  dnsClient: DnsClient,
  contextId: string,
  domain: string,
  subdomain: string,
  cdnDomain: string,
): Promise<boolean> {
  const zones = await dnsClient.listZones(contextId)
  const parentZone = zones.find((z) => z.domain === domain)

  if (!parentZone) {
    log.warn(`DNS zone for ${domain} not found`)
    return false
  }

  let targetZoneId = zones.find((z) => z.domain === subdomain)?.id

  if (!targetZoneId) {
    const prefix = subdomain.replace(`.${domain}`, '')
    const created = await dnsClient.createZone(prefix, parentZone.id)
    targetZoneId = created.id
    log.info(`Created DNS zone for ${subdomain}: ${targetZoneId}`)
  }

  if (!targetZoneId) return false

  const result = await dnsClient.setCname(targetZoneId, cdnDomain)
  log.info(`DNS CNAME: ${result ? '✅' : '❌'}`)
  return result
}

export async function unconfigureDnsCname(
  dnsClient: DnsClient,
  contextId: string,
  subdomain: string,
): Promise<boolean> {
  if (!dnsClient.clearCname) return false
  const zones = await dnsClient.listZones(contextId)
  const targetZoneId = zones.find((z) => z.domain === subdomain)?.id
  if (!targetZoneId) {
    // Zone already gone (or never existed) — treat as success for idempotency.
    return true
  }
  const result = await dnsClient.clearCname(targetZoneId)
  log.info(`DNS CNAME clear for ${subdomain}: ${result ? '✅' : '❌'}`)
  return result
}

function resolveCustomHostname(data: CreatePullZoneInput): string | null {
  // Full-Site always has a custom hostname (that's the whole point of the mode);
  // Asset is opt-in via the toggle (default on).
  if (data.cdnMode === 'full-site' && data.hostname) return data.hostname
  if (data.cdnMode === 'asset' && data.domain && (data.customHostnameEnabled ?? true)) {
    return `cdn.${data.domain}`
  }
  return null
}

async function registerCustomHostnameAtBunny(
  pullZoneId: number,
  cdnMode: 'asset' | 'full-site',
  customHostname: string,
  apiKey: string,
): Promise<void> {
  if (cdnMode === 'full-site') {
    await bunny.setupFullSiteCdn(pullZoneId, customHostname, apiKey)
  } else {
    await bunny.addHostname(pullZoneId, customHostname, apiKey)
    await bunny.enableFreeSsl(pullZoneId, customHostname, apiKey)
  }
}

async function tryConfigureDnsCname(
  dnsClient: DnsClient | undefined,
  contextId: string,
  domain: string | undefined,
  customHostname: string,
  cdnDomain: string,
): Promise<boolean> {
  if (!dnsClient || !domain) return false
  try {
    log.info(`Creating DNS CNAME: ${customHostname} → ${cdnDomain}`)
    return await configureDnsCname(dnsClient, contextId, domain, customHostname, cdnDomain)
  } catch (dnsError) {
    log.warn('[domain] Auto-DNS failed (non-fatal):', dnsError instanceof Error ? dnsError.message : dnsError)
    return false
  }
}

export async function createPullZone(
  db: AppDatabase,
  extensionInstanceId: string,
  contextId: string,
  data: CreatePullZoneInput,
  dnsClient?: DnsClient,
): Promise<CreatePullZoneResult> {
  const instance = db.select().from(extensionInstances).where(eq(extensionInstances.id, extensionInstanceId)).get()
  if (!instance?.encryptedApiKey) {
    throw createAppError(ErrorType.VALIDATION_ERROR, 'Kein API Key hinterlegt.', {
      retryable: false,
      code: 'NO_API_KEY',
    })
  }

  const apiKey = decrypt(instance.encryptedApiKey)

  log.info(`Creating pull zone for instance ${extensionInstanceId} (apiKey: [REDACTED])`)
  const result = await bunny.createPullZone({ name: data.name, originUrl: data.originUrl, apiKey })

  try {
    if (data.euOnly) {
      await bunny.setEuMode(result.id, true, apiKey)
    }

    const customHostname = resolveCustomHostname(data)
    if (customHostname) {
      await registerCustomHostnameAtBunny(result.id, data.cdnMode, customHostname, apiKey)
    }

    const dnsConfigured = customHostname
      ? await tryConfigureDnsCname(dnsClient, contextId, data.domain, customHostname, result.cdnDomain)
      : false

    db.insert(pullZones)
      .values({
        id: result.id,
        instanceId: extensionInstanceId,
        cdnDomain: result.cdnDomain,
        originUrl: data.originUrl,
        cdnMode: data.cdnMode,
        customHostname,
        createdAt: new Date(),
      })
      .run()

    return {
      id: result.id,
      cdnDomain: result.cdnDomain,
      originUrl: data.originUrl,
      cdnMode: data.cdnMode,
      dnsConfigured,
      customHostname,
    }
  } catch (err) {
    // Adopted zones pre-date our call — leave them alone, the user already owns them.
    if (!result.adopted) {
      try {
        await bunny.deletePullZone(result.id, apiKey)
        log.info(`Rolled back bunny pull zone ${result.id} after creation failure`)
      } catch (cleanupErr) {
        log.error(
          `Rollback of bunny pull zone ${result.id} failed — manual cleanup required`,
          cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
        )
      }
    }
    throw err
  }
}

/**
 * Registers `cdn.<domain>` as a custom hostname on an existing pull zone:
 * bunny.net addHostname + free SSL + mittwald CNAME. For Asset-Mode only —
 * Full-Site pull zones already have their hostname by definition.
 */
export async function addCustomHostname(
  db: AppDatabase,
  extensionInstanceId: string,
  contextId: string,
  domain: string,
  dnsClient?: DnsClient,
): Promise<{ customHostname: string; dnsConfigured: boolean }> {
  const { pullZone, apiKey } = loadInstanceAndPullZone(db, extensionInstanceId)
  if (pullZone.cdnMode !== 'asset') {
    throw createAppError(
      ErrorType.VALIDATION_ERROR,
      'Custom Hostname lässt sich nur im Asset-Modus umschalten; Full-Site-Pull-Zones haben konzeptbedingt immer einen.',
      { retryable: false, code: 'CUSTOM_HOSTNAME_ASSET_ONLY' },
    )
  }
  if (pullZone.customHostname) {
    // Already set — no-op for idempotency. Use removeCustomHostname first if
    // you need to switch to a different hostname.
    return { customHostname: pullZone.customHostname, dnsConfigured: false }
  }

  const customHostname = `cdn.${domain}`

  await bunny.addHostname(pullZone.id, customHostname, apiKey)

  try {
    await bunny.enableFreeSsl(pullZone.id, customHostname, apiKey)

    let dnsConfigured = false
    if (dnsClient) {
      try {
        dnsConfigured = await configureDnsCname(dnsClient, contextId, domain, customHostname, pullZone.cdnDomain)
      } catch (dnsError) {
        log.warn(
          '[domain] addCustomHostname auto-DNS failed (non-fatal):',
          dnsError instanceof Error ? dnsError.message : dnsError,
        )
      }
    }

    db.update(pullZones).set({ customHostname }).where(eq(pullZones.instanceId, extensionInstanceId)).run()

    return { customHostname, dnsConfigured }
  } catch (err) {
    try {
      await bunny.removeHostname(pullZone.id, customHostname, apiKey)
      log.info(`Rolled back custom hostname ${customHostname} on pull zone ${pullZone.id} after failure`)
    } catch (cleanupErr) {
      log.error(
        `Rollback of custom hostname ${customHostname} failed — manual cleanup required`,
        cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
      )
    }
    throw err
  }
}

/**
 * Reverses `addCustomHostname`: removes the hostname from bunny.net, clears
 * the mittwald CNAME record if a DNS client is provided, and nulls out the
 * DB field. Asset-Mode only — Full-Site pull zones cannot drop their
 * hostname without tearing down the whole integration.
 */
export async function removeCustomHostname(
  db: AppDatabase,
  extensionInstanceId: string,
  contextId: string,
  dnsClient?: DnsClient,
): Promise<{ dnsCleared: boolean }> {
  const { pullZone, apiKey } = loadInstanceAndPullZone(db, extensionInstanceId)
  if (pullZone.cdnMode !== 'asset') {
    throw createAppError(
      ErrorType.VALIDATION_ERROR,
      'Custom Hostname lässt sich nur im Asset-Modus umschalten; Full-Site-Pull-Zones haben konzeptbedingt immer einen.',
      { retryable: false, code: 'CUSTOM_HOSTNAME_ASSET_ONLY' },
    )
  }
  if (!pullZone.customHostname) {
    return { dnsCleared: false }
  }

  await bunny.removeHostname(pullZone.id, pullZone.customHostname, apiKey)

  let dnsCleared = false
  if (dnsClient) {
    try {
      dnsCleared = await unconfigureDnsCname(dnsClient, contextId, pullZone.customHostname)
    } catch (dnsError) {
      log.warn(
        '[domain] removeCustomHostname DNS clear failed (non-fatal):',
        dnsError instanceof Error ? dnsError.message : dnsError,
      )
    }
  }

  db.update(pullZones).set({ customHostname: null }).where(eq(pullZones.instanceId, extensionInstanceId)).run()

  return { dnsCleared }
}

/**
 * Drops the pull-zone link from the extension without touching bunny.net.
 * Use case: the user wants to uninstall the extension but keep the zone at
 * bunny.net (and continue managing it from the bunny.net dashboard).
 *
 * The mittwald CNAME is intentionally *not* cleaned up here: the user
 * keeps the zone, so the CNAME is probably what they want to keep too.
 */
export function detachPullZone(db: AppDatabase, extensionInstanceId: string): { pullZoneId: number } {
  const pullZone = db.select().from(pullZones).where(eq(pullZones.instanceId, extensionInstanceId)).get()
  if (!pullZone) {
    throw createAppError(ErrorType.NOT_FOUND, 'Keine Pull Zone vorhanden.', {
      retryable: false,
      code: 'PULL_ZONE_NOT_FOUND',
    })
  }
  log.info(`Detaching pull zone ${pullZone.id} from instance ${extensionInstanceId} (bunny zone preserved)`)
  db.delete(pullZones).where(eq(pullZones.instanceId, extensionInstanceId)).run()
  return { pullZoneId: pullZone.id }
}

export function loadInstanceAndPullZone(db: AppDatabase, extensionInstanceId: string) {
  const instance = db.select().from(extensionInstances).where(eq(extensionInstances.id, extensionInstanceId)).get()
  if (!instance?.encryptedApiKey) {
    throw createAppError(ErrorType.VALIDATION_ERROR, 'Kein API Key hinterlegt.', {
      retryable: false,
      code: 'NO_API_KEY',
    })
  }
  const pullZone = db.select().from(pullZones).where(eq(pullZones.instanceId, extensionInstanceId)).get()
  if (!pullZone) {
    throw createAppError(ErrorType.NOT_FOUND, 'Keine Pull Zone vorhanden.', {
      retryable: false,
      code: 'PULL_ZONE_NOT_FOUND',
    })
  }
  return { instance, pullZone, apiKey: decrypt(instance.encryptedApiKey) }
}
