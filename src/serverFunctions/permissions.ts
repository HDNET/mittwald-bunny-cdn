import type { MittwaldAPIV2Client } from '@mittwald/api-client'
import { createServerFn } from '@tanstack/react-start'
import { authMiddlewareWithAccessToken } from '~/middleware/auth'
import { getProjectRole } from '~/server/membership'

export const checkPermissionsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddlewareWithAccessToken])
  .handler(
    async ({
      context,
    }: {
      context: { extensionInstanceId: string; contextId: string; mittwaldClient: MittwaldAPIV2Client }
    }) => {
      const { role, allowed } = await getProjectRole(context.mittwaldClient, context.contextId)
      return { role, allowed }
    },
  )
