import type { HealthStatus } from '~/shared/types'

/**
 * Determines which DNS name we expect to CNAME to the Bunny pull zone
 * so that our live DNS health check knows what FQDN to resolve.
 * - Asset-CDN: always `cdn.<domain-from-originUrl>`
 * - Full-site: the first customer-facing hostname attached to the pull zone
 */
export function deriveDnsTarget(
  cdnMode: 'asset' | 'full-site',
  originUrl: string,
  hostnames: Array<{ value: string }>,
): string | null {
  if (cdnMode === 'asset') {
    try {
      const { hostname } = new URL(originUrl)
      return `cdn.${hostname}`
    } catch {
      return null
    }
  }
  return hostnames.find((h) => !h.value.endsWith('.b-cdn.net'))?.value ?? null
}

/**
 * Derives SSL health from the pull zone hostnames.
 * - Asset-CDN is served from *.b-cdn.net, which is always covered by Bunny's wildcard cert.
 * - Full-site has an attached custom hostname; we report whether the free Let's Encrypt
 *   certificate has been issued for it yet.
 */
export function deriveSslStatus(
  cdnMode: 'asset' | 'full-site',
  hostnames: Array<{ value: string; hasCertificate: boolean }>,
): Extract<HealthStatus, 'ok' | 'pending' | 'missing'> {
  if (cdnMode === 'asset') return 'ok'
  const custom = hostnames.find((h) => !h.value.endsWith('.b-cdn.net'))
  if (!custom) return 'missing'
  return custom.hasCertificate ? 'ok' : 'pending'
}
