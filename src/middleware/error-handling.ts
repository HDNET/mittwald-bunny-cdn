import { createMiddleware } from '@tanstack/react-start'

export const handleServerErrors = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    console.error('[server] Unhandled error:', error)
    throw error
  }
})
