import { createServerFn } from '@tanstack/react-start'
import { loadInstanceAndPullZone } from '~/domain/pull-zone'
import { authMiddleware } from '~/middleware/auth'
import * as bunny from '~/server/bunnycdn'
import { getDb } from '~/server/db/index'
import { requireEnabled } from '~/server/scope'

export const updateSettingsFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(
    // @ts-expect-error — ghostmaker middleware typing does not expose data param
    async ({
      context,
      data,
    }: {
      context: { extensionInstanceId: string }
      data: {
        enabled?: boolean
        optimizer?: { image?: boolean; webp?: boolean; avif?: boolean; cssMinify?: boolean; jsMinify?: boolean }
        cacheTtl?: { edge?: number; browser?: number }
        hotlink?: { allowedReferrers?: string[] }
        smartCache?: boolean
        euOnly?: boolean
      }
    }) => {
      const db = getDb()
      requireEnabled(db, context.extensionInstanceId)
      const { apiKey, pullZone } = loadInstanceAndPullZone(db, context.extensionInstanceId)

      if (data.euOnly !== undefined) {
        await bunny.setEuMode(pullZone.id, data.euOnly, apiKey)
      }

      const { euOnly: _euOnly, ...bunnyPatch } = data
      if (Object.keys(bunnyPatch).length > 0) {
        await bunny.updatePullZoneSettings(pullZone.id, bunnyPatch, apiKey)
      }

      return { success: true }
    },
  )
