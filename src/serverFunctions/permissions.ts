import type { MittwaldAPIV2Client } from '@mittwald/api-client'
import { createServerFn } from '@tanstack/react-start'
import { authMiddlewareWithAccessToken } from '~/middleware/auth'
import { getDb } from '~/server/db/index'
import { getProjectRole } from '~/server/membership'
import { requireInstanceExists } from '~/server/scope'

export const checkPermissionsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddlewareWithAccessToken])
  .handler(
    async ({
      context,
    }: {
      context: { extensionInstanceId: string; contextId: string; mittwaldClient: MittwaldAPIV2Client }
    }) => {
      requireInstanceExists(getDb(), context.extensionInstanceId)
      const { role, allowed } = await getProjectRole(context.mittwaldClient, context.contextId)
      return { role, allowed }
    },
  )
