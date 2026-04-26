import type { Logger } from '@weissaufschwarz/mitthooks/logging/interface.js'
import { APIPublicKeyProvider, CachingPublicKeyProvider } from '@weissaufschwarz/mitthooks/verification/publicKeys.js'
import { WebhookVerifier } from '@weissaufschwarz/mitthooks/verification/verify.js'
import type { WebhookContent } from '@weissaufschwarz/mitthooks/webhook.js'
import { createLogger } from '~/server/logger.js'
import { createAppError, ErrorType } from '~/shared/errors.js'

const log = createLogger('webhook')

/**
 * Extracts webhook signature data from incoming HTTP request headers.
 *
 * mittwald sends three headers for signature verification:
 * - X-Marketplace-Signature-Serial: identifies the public key
 * - X-Marketplace-Signature-Algorithm: the signing algorithm (ed25519)
 * - X-Marketplace-Signature: the base64-encoded signature
 */
export function extractWebhookContent(rawBody: string, headers: Record<string, string | undefined>): WebhookContent {
  return {
    rawBody,
    signatureSerial: headers['x-marketplace-signature-serial'] ?? '',
    signatureAlgorithm: headers['x-marketplace-signature-algorithm'] ?? '',
    signature: headers['x-marketplace-signature'] ?? '',
  }
}

const serverLogger: Logger = {
  info: (message: string) => log.info(`${message}`),
  debug: () => {},
  error: (message: string) => log.error(`${message}`),
}

/**
 * Creates a WebhookVerifier instance backed by the mittwald public key API.
 * Public keys are cached to avoid repeated API calls for the same serial.
 */
export function createWebhookVerifier(logger?: Logger): WebhookVerifier {
  const apiKeyProvider = APIPublicKeyProvider.newWithUnauthenticatedAPIClient()
  const cachingProvider = new CachingPublicKeyProvider(apiKeyProvider)
  return new WebhookVerifier(logger ?? serverLogger, cachingProvider)
}

/**
 * Validates a webhook signature using the mitthooks library.
 *
 * Returns true if the signature is valid, false otherwise.
 * Throws only on unexpected infrastructure errors (e.g. failed to fetch public key).
 */
export async function validateWebhookSignature(
  webhookContent: WebhookContent,
  verifier?: WebhookVerifier,
): Promise<boolean> {
  const v = verifier ?? createWebhookVerifier()

  try {
    return await v.verify(webhookContent)
  } catch {
    // Missing headers or verification infrastructure errors → treat as invalid
    return false
  }
}

/**
 * Middleware-style function for webhook signature validation.
 *
 * Validates the signature of an incoming webhook request.
 * Returns null if the signature is valid (proceed with processing).
 * Returns an HTTP 401 Response if the signature is invalid.
 *
 * Usage:
 *   const rejection = await verifyWebhookOrReject(rawBody, headers);
 *   if (rejection) return rejection;
 *   // ... process webhook payload
 */
export async function verifyWebhookOrReject(
  rawBody: string,
  headers: Record<string, string | undefined>,
  verifier?: WebhookVerifier,
): Promise<Response | null> {
  const webhookContent = extractWebhookContent(rawBody, headers)
  const isValid = await validateWebhookSignature(webhookContent, verifier)

  if (!isValid) {
    return new Response(
      JSON.stringify(
        createAppError(ErrorType.AUTH_ERROR, 'Ungültige Webhook-Signatur.', {
          retryable: false,
        }),
      ),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  return null
}
