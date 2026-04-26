import type { MittwaldAPIV2Client } from '@mittwald/api-client'
import { createServerFn } from '@tanstack/react-start'
import { authMiddlewareWithAccessToken } from '~/middleware/auth'
import { getDb } from '~/server/db/index'
import { createLogger } from '~/server/logger.js'
import { requireScope } from '~/server/scope'
import { createAppError, ErrorType } from '~/shared/errors'

const log = createLogger('api')

export const getDomainsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddlewareWithAccessToken])
  .handler(
    async ({
      context,
    }: {
      context: { extensionInstanceId: string; contextId: string; mittwaldClient: MittwaldAPIV2Client }
    }) => {
      requireScope(getDb(), context.extensionInstanceId, 'domain:read')

      log.info(`Fetching domains and ingresses for context ${context.contextId}`)

      const [domainsRes, ingressRes] = await Promise.all([
        context.mittwaldClient.domain.listDomains({ queryParameters: { projectId: context.contextId } }),
        context.mittwaldClient.domain.ingressListIngresses({ queryParameters: { projectId: context.contextId } }),
      ])

      if (domainsRes.status !== 200) {
        throw createAppError(ErrorType.MITTWALD_API_ERROR, `mittwald API Fehler (HTTP ${domainsRes.status}).`, {
          retryable: domainsRes.status >= 500,
          code: 'MITTWALD_API_ERROR',
          variables: { status: domainsRes.status },
        })
      }

      if (ingressRes.status !== 200) {
        // Ingress-list failure is non-fatal for the wizard (Asset-CDN doesn't need it),
        // but we log it explicitly so full-site auto-fill quietly failing is traceable.
        log.warn(`Ingress list returned HTTP ${ingressRes.status}; defaultOrigin will be null`)
      }

      const defaultIngress =
        ingressRes.status === 200 ? ingressRes.data.find((i: { isDefault: boolean }) => i.isDefault) : null

      return {
        domains: domainsRes.data.map((d: { domainId: string; domain: string }) => ({
          id: d.domainId,
          hostname: d.domain,
        })),
        defaultOrigin: defaultIngress ? `https://${defaultIngress.hostname}` : null,
      }
    },
  )
