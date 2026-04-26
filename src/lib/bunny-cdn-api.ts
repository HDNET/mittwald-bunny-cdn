import { BunnyCdnGhost } from '~/ghosts'
import type { SettingsPatch } from '~/shared/types'

/**
 * Typed adapter for BunnyCdnGhost calls that need a `data` payload.
 *
 * Why this file exists: Ghostmaker's inferred remote-call type does not expose
 * the `data` parameter that the underlying TanStack server function accepts.
 * Rather than sprinkling `@ts-expect-error` across every call site, we absorb
 * that type-system gap here in one place and hand out well-typed wrappers.
 */

interface CreatePullZoneInput {
  name: string
  originUrl: string
  cdnMode: 'asset' | 'full-site'
  hostname?: string
  domain?: string
  customHostnameEnabled?: boolean
}

interface CreatePullZoneResult {
  id: number
  cdnDomain: string
  originUrl: string
  cdnMode: string
  dnsConfigured: boolean
  customHostname: string | null
}

export async function saveApiKey(apiKey: string): Promise<{ success: boolean }> {
  // @ts-expect-error — ghostmaker remote typing does not expose data param
  return BunnyCdnGhost.saveApiKey({ data: { apiKey } })
}

export async function deleteApiKey(): Promise<{ success: boolean }> {
  return BunnyCdnGhost.deleteApiKey()
}

export async function createPullZone(input: CreatePullZoneInput): Promise<CreatePullZoneResult> {
  // @ts-expect-error — ghostmaker remote typing does not expose data param
  return BunnyCdnGhost.createPullZone({ data: input })
}

export async function updateSettings(patch: SettingsPatch): Promise<{ success: boolean }> {
  // @ts-expect-error — ghostmaker remote typing does not expose data param
  return BunnyCdnGhost.updateSettings({ data: patch })
}

export async function deletePullZone(): Promise<{ success: boolean }> {
  return BunnyCdnGhost.deletePullZone()
}

export async function purgeCache(): Promise<{ success: boolean }> {
  return BunnyCdnGhost.purgeCache()
}

export async function addCustomHostname(domain: string): Promise<{ customHostname: string; dnsConfigured: boolean }> {
  // @ts-expect-error — ghostmaker remote typing does not expose data param
  return BunnyCdnGhost.addCustomHostname({ data: { domain } })
}

export async function removeCustomHostname(): Promise<{ dnsCleared: boolean }> {
  return BunnyCdnGhost.removeCustomHostname()
}
