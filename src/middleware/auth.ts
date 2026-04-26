import { MittwaldAPIV2Client } from '@mittwald/api-client'
import { getSessionToken } from '@mittwald/ext-bridge/browser'
import { getAccessToken, verify } from '@mittwald/ext-bridge/node'
import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import type { FunctionMiddlewareClientNextFn } from '@tanstack/start-client-core'
import { getEnvironmentVariables } from '~/env'
import { assertInstanceContextMatches } from '~/server/scope'

type VerifiedSessionToken = Awaited<ReturnType<typeof verify>>

const sessionTokenHeader = 'x-session-token'

async function forwardSessionToken(next: FunctionMiddlewareClientNextFn<object, unknown>) {
  const token = await getSessionToken()
  return next({ headers: { [sessionTokenHeader]: token } })
}

async function getVerifiedSessionToken(): Promise<[VerifiedSessionToken, string]> {
  const sessionToken = getRequestHeader(sessionTokenHeader)
  if (!sessionToken) {
    throw new Error('No session token found')
  }
  const verifiedSessionToken = await verify(sessionToken)
  return [verifiedSessionToken, sessionToken]
}

export const authMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => forwardSessionToken(next))
  .server(async ({ next }) => {
    const [verified] = await getVerifiedSessionToken()
    assertInstanceContextMatches(verified.extensionInstanceId, verified.contextId)
    return next({
      context: {
        contextId: verified.contextId,
        extensionInstanceId: verified.extensionInstanceId,
        userId: verified.userId,
      },
    })
  })

export const authMiddlewareWithAccessToken = createMiddleware({ type: 'function' })
  .client(async ({ next }) => forwardSessionToken(next))
  .server(async ({ next }) => {
    const [verified, sessionToken] = await getVerifiedSessionToken()
    assertInstanceContextMatches(verified.extensionInstanceId, verified.contextId)
    const env = getEnvironmentVariables()
    const accessToken = await getAccessToken(sessionToken, env.EXTENSION_SECRET)
    const mittwaldClient = MittwaldAPIV2Client.newWithToken(accessToken.publicToken)

    return next({
      context: {
        contextId: verified.contextId,
        extensionInstanceId: verified.extensionInstanceId,
        userId: verified.userId,
        accessToken: accessToken.publicToken,
        mittwaldClient,
      },
    })
  })
