import type { MittwaldAPIV2Client } from '@mittwald/api-client'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import {
  addCustomHostname as addCustomHostnameDomain,
  createPullZone as createPullZoneDomain,
  type DnsClient,
  removeCustomHostname as removeCustomHostnameDomain,
  unconfigureDnsCname,
} from '~/domain/pull-zone'
import { authMiddleware, authMiddlewareWithAccessToken } from '~/middleware/auth'
import * as bunny from '~/server/bunnycdn'
import { decrypt } from '~/server/crypto'
import { getDb } from '~/server/db/index'
import { extensionInstances, pullZones } from '~/server/db/schema'
import { deriveDnsTarget, deriveSslStatus } from '~/server/health-helpers'
import { createLogger } from '~/server/logger.js'
import { requireProjectRole } from '~/server/membership'
import { requireEnabled, requireScope } from '~/server/scope'
import { invalidateCached } from '~/server/stats-cache'
import { createAppError, ErrorType } from '~/shared/errors'
import { validateCdnMode, validateNonEmpty, validateUrl } from '~/shared/validation'

const log = createLogger('api')

// Build a DnsClient adapter around the mittwald API client. Module-private:
// the three pull-zone write paths (create, add-custom-hostname, remove-
// custom-hostname) are the only consumers.
function buildDnsClient(mittwaldClient: MittwaldAPIV2Client): DnsClient {
  return {
    listZones: async (projectId: string) => {
      const res = await mittwaldClient.domain.dnsListDnsZones({ projectId })
      return res.status === 200
        ? res.data.map((z: { id: string; domain: string }) => ({ id: z.id, domain: z.domain }))
        : []
    },
    createZone: async (zoneName: string, parentZoneId: string) => {
      const res = await mittwaldClient.domain.dnsCreateDnsZone({ data: { name: zoneName, parentZoneId } })
      if (res.status === 201) return { id: res.data.id }
      throw new Error(`Failed to create DNS zone: ${res.status}`)
    },
    setCname: async (zoneId: string, fqdn: string) => {
      const res = await mittwaldClient.domain.dnsUpdateRecordSet({
        dnsZoneId: zoneId,
        recordSet: 'cname',
        data: { fqdn, settings: { ttl: { auto: true } } },
      })
      return res.status === 204
    },
    clearCname: async (zoneId: string) => {
      // Empty fqdn + managed TTL = mittwald clears the existing CNAME.
      const res = await mittwaldClient.domain.dnsUpdateRecordSet({
        dnsZoneId: zoneId,
        recordSet: 'cname',
        data: { fqdn: '', settings: { ttl: { auto: true } } },
      })
      return res.status === 204
    },
  }
}

export const createPullZoneFn = createServerFn({ method: 'POST' })
  .middleware([authMiddlewareWithAccessToken])
  .handler(
    // @ts-expect-error — ghostmaker middleware typing does not expose data param
    async ({
      context,
      data,
    }: {
      context: {
        extensionInstanceId: string
        contextId: string
        mittwaldClient: MittwaldAPIV2Client
        accessToken: string
      }
      data: {
        name: string
        originUrl: string
        cdnMode: string
        hostname?: string
        domain?: string
        customHostnameEnabled?: boolean
      }
    }) => {
      const db = getDb()
      requireEnabled(db, context.extensionInstanceId)

      const name = validateNonEmpty(data.name, 'Pull Zone Name')
      const originUrl = validateUrl(validateNonEmpty(data.originUrl, 'Origin URL'), 'Origin URL')
      const cdnMode = validateCdnMode(data.cdnMode)
      const customHostnameEnabled = data.customHostnameEnabled ?? true

      // The mittwald write-side APIs (DNS + custom hostname CNAME) only matter
      // when we actually plan to touch them — i.e. customHostnameEnabled and
      // a domain to attach to. Pure Asset-Mode "give me just the .b-cdn.net
      // URL" goes through without needing domain:write / owner.
      const needsDomainWrite = !!data.domain && (cdnMode === 'full-site' || customHostnameEnabled)
      if (needsDomainWrite) {
        requireScope(db, context.extensionInstanceId, 'domain:write')
        // Fail fast before hitting mittwald DNS APIs — without owner role the
        // DNS zone / record create calls later in createPullZoneDomain would
        // return 403 with a cryptic message. We surface the "contact admin"
        // hint up front instead.
        await requireProjectRole(context.mittwaldClient, context.contextId)
      }

      const dnsClient = buildDnsClient(context.mittwaldClient)

      return createPullZoneDomain(
        db,
        context.extensionInstanceId,
        context.contextId,
        { name, originUrl, cdnMode, hostname: data.hostname, domain: data.domain, customHostnameEnabled },
        dnsClient,
      )
    },
  )

export const addCustomHostnameFn = createServerFn({ method: 'POST' })
  .middleware([authMiddlewareWithAccessToken])
  .handler(
    // @ts-expect-error — ghostmaker middleware typing does not expose data param
    async ({
      context,
      data,
    }: {
      context: {
        extensionInstanceId: string
        contextId: string
        mittwaldClient: MittwaldAPIV2Client
      }
      data: { domain: string }
    }) => {
      const db = getDb()
      requireEnabled(db, context.extensionInstanceId)
      requireScope(db, context.extensionInstanceId, 'domain:write')
      await requireProjectRole(context.mittwaldClient, context.contextId)

      const domain = validateNonEmpty(data.domain, 'Domain')
      const dnsClient = buildDnsClient(context.mittwaldClient)
      return addCustomHostnameDomain(db, context.extensionInstanceId, context.contextId, domain, dnsClient)
    },
  )

export const removeCustomHostnameFn = createServerFn({ method: 'POST' })
  .middleware([authMiddlewareWithAccessToken])
  .handler(
    async ({
      context,
    }: {
      context: {
        extensionInstanceId: string
        contextId: string
        mittwaldClient: MittwaldAPIV2Client
      }
    }) => {
      const db = getDb()
      requireEnabled(db, context.extensionInstanceId)
      requireScope(db, context.extensionInstanceId, 'domain:write')
      await requireProjectRole(context.mittwaldClient, context.contextId)

      const dnsClient = buildDnsClient(context.mittwaldClient)
      return removeCustomHostnameDomain(db, context.extensionInstanceId, context.contextId, dnsClient)
    },
  )

export const deletePullZoneFn = createServerFn({ method: 'POST' })
  .middleware([authMiddlewareWithAccessToken])
  .handler(
    async ({
      context,
    }: {
      context: {
        extensionInstanceId: string
        contextId: string
        mittwaldClient: MittwaldAPIV2Client
      }
    }) => {
      const db = getDb()
      requireEnabled(db, context.extensionInstanceId)

      const instance = db
        .select()
        .from(extensionInstances)
        .where(eq(extensionInstances.id, context.extensionInstanceId))
        .get()
      const pullZone = db.select().from(pullZones).where(eq(pullZones.instanceId, context.extensionInstanceId)).get()
      if (!pullZone)
        throw createAppError(ErrorType.NOT_FOUND, 'Keine Pull Zone vorhanden.', {
          retryable: false,
          code: 'PULL_ZONE_NOT_FOUND',
        })

      // Delete pull zone at bunny.net
      if (instance?.encryptedApiKey) {
        const apiKey = decrypt(instance.encryptedApiKey)
        log.info(`Deleting pull zone ${pullZone.id} (apiKey: [REDACTED])`)
        await bunny.deletePullZone(pullZone.id, apiKey)
      }

      // Clean up mittwald CNAME if a custom hostname was configured
      if (pullZone.customHostname) {
        try {
          const dnsClient = buildDnsClient(context.mittwaldClient)
          await unconfigureDnsCname(dnsClient, context.contextId, pullZone.customHostname)
          log.info(`Cleaned up CNAME for ${pullZone.customHostname}`)
        } catch (e) {
          log.warn(`CNAME cleanup failed for ${pullZone.customHostname} — may need manual removal`, e)
        }
      }

      db.delete(pullZones).where(eq(pullZones.instanceId, context.extensionInstanceId)).run()
      invalidateCached(pullZone.id)
      return { success: true }
    },
  )

export const getPullZoneStatusFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { extensionInstanceId: string } }) => {
    const db = getDb()
    const instance = db
      .select()
      .from(extensionInstances)
      .where(eq(extensionInstances.id, context.extensionInstanceId))
      .get()
    const pullZone = db.select().from(pullZones).where(eq(pullZones.instanceId, context.extensionInstanceId)).get()
    const extensionEnabled = instance?.enabled ?? true

    if (!pullZone) return { exists: false, extensionEnabled }

    if (instance?.encryptedApiKey) {
      try {
        const apiKey = decrypt(instance.encryptedApiKey)
        const remote = await bunny.getPullZone(pullZone.id, apiKey)
        if (!remote) {
          log.info(`Pull zone ${pullZone.id} not found at bunny.net, cleaning up`)
          db.delete(pullZones).where(eq(pullZones.instanceId, context.extensionInstanceId)).run()
          return { exists: false, extensionEnabled }
        }

        const dnsTarget = deriveDnsTarget(pullZone.cdnMode, pullZone.originUrl, remote.hostnames)
        const [dnsOk, originHealth] = await Promise.all([
          dnsTarget ? bunny.checkDnsCname(dnsTarget, remote.cdnDomain) : Promise.resolve(false),
          bunny.pingOrigin(pullZone.originUrl),
        ])

        return {
          exists: true,
          extensionEnabled,
          id: pullZone.id,
          cdnDomain: pullZone.cdnDomain,
          originUrl: pullZone.originUrl,
          cdnMode: pullZone.cdnMode,
          customHostname: pullZone.customHostname,
          enabled: remote.enabled,
          euOnly:
            remote.enableGeoZoneEU &&
            !remote.enableGeoZoneUS &&
            !remote.enableGeoZoneASIA &&
            !remote.enableGeoZoneSA &&
            !remote.enableGeoZoneAF,
          optimizer: remote.optimizer,
          cacheTtl: remote.cacheTtl,
          hotlink: remote.hotlink,
          smartCache: remote.smartCache,
          health: {
            ssl: deriveSslStatus(pullZone.cdnMode, remote.hostnames),
            dns: dnsOk ? 'ok' : 'pending',
            origin: originHealth.status,
            originResponseMs: originHealth.responseMs,
          },
        }
      } catch (syncError) {
        log.warn(
          '[api] Pull zone sync check failed (non-fatal):',
          syncError instanceof Error ? syncError.message : syncError,
        )
      }
    }

    return {
      exists: true,
      extensionEnabled,
      id: pullZone.id,
      cdnDomain: pullZone.cdnDomain,
      originUrl: pullZone.originUrl,
      cdnMode: pullZone.cdnMode,
      customHostname: pullZone.customHostname,
      euOnly: false,
    }
  })

export const purgeCacheFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { extensionInstanceId: string } }) => {
    const db = getDb()
    requireEnabled(db, context.extensionInstanceId)

    const instance = db
      .select()
      .from(extensionInstances)
      .where(eq(extensionInstances.id, context.extensionInstanceId))
      .get()
    if (!instance?.encryptedApiKey)
      throw createAppError(ErrorType.VALIDATION_ERROR, 'Kein API Key hinterlegt.', {
        retryable: false,
        code: 'NO_API_KEY',
      })

    const pullZone = db.select().from(pullZones).where(eq(pullZones.instanceId, context.extensionInstanceId)).get()
    if (!pullZone)
      throw createAppError(ErrorType.NOT_FOUND, 'Keine Pull Zone vorhanden.', {
        retryable: false,
        code: 'PULL_ZONE_NOT_FOUND',
      })

    const apiKey = decrypt(instance.encryptedApiKey)
    log.info(`Purging cache for pull zone ${pullZone.id} (apiKey: [REDACTED])`)
    await bunny.purgeCache(pullZone.id, apiKey)
    return { success: true }
  })
