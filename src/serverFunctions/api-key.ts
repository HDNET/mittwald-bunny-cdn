import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '~/middleware/auth'
import * as bunny from '~/server/bunnycdn'
import { decrypt, encrypt } from '~/server/crypto'
import { getDb } from '~/server/db/index'
import { extensionInstances } from '~/server/db/schema'
import { createLogger } from '~/server/logger.js'
import { requireEnabled, requireInstanceExists } from '~/server/scope'
import { createAppError, ErrorType } from '~/shared/errors'
import { validateNonEmpty } from '~/shared/validation'

const log = createLogger('api')

export const saveApiKeyFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  // @ts-expect-error — ghostmaker middleware typing does not expose data param
  .handler(async ({ context, data }: { context: { extensionInstanceId: string }; data: { apiKey: string } }) => {
    const db = getDb()
    requireEnabled(db, context.extensionInstanceId)

    const key = validateNonEmpty(data.apiKey, 'API Key')
    const isValid = await bunny.validateApiKey(key)
    if (!isValid)
      throw createAppError(ErrorType.VALIDATION_ERROR, 'Ungültiger bunny.net API Key.', {
        retryable: false,
        code: 'INVALID_API_KEY',
      })

    const encryptedKey = encrypt(key)
    log.info(`Saving API key for instance ${context.extensionInstanceId} (key: [REDACTED])`)

    db.update(extensionInstances)
      .set({ encryptedApiKey: encryptedKey, updatedAt: new Date() })
      .where(eq(extensionInstances.id, context.extensionInstanceId))
      .run()

    return { success: true }
  })

export const deleteApiKeyFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { extensionInstanceId: string } }) => {
    const db = getDb()
    requireEnabled(db, context.extensionInstanceId)

    db.update(extensionInstances)
      .set({ encryptedApiKey: null, updatedAt: new Date() })
      .where(eq(extensionInstances.id, context.extensionInstanceId))
      .run()
    return { success: true }
  })

export const getApiKeyStatusFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { extensionInstanceId: string } }) => {
    const instance = requireInstanceExists(getDb(), context.extensionInstanceId)
    if (!instance.encryptedApiKey) return { hasApiKey: false, last4: null }
    try {
      const key = decrypt(instance.encryptedApiKey)
      return { hasApiKey: true, last4: key.slice(-4) }
    } catch {
      return { hasApiKey: true, last4: null }
    }
  })
