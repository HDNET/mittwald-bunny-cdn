import type { WebhookVerifier } from '@weissaufschwarz/mitthooks/verification/verify.js'
import type { WebhookContent } from '@weissaufschwarz/mitthooks/webhook.js'
import { describe, expect, it, vi } from 'vitest'
import { extractWebhookContent, validateWebhookSignature, verifyWebhookOrReject } from '~/server/webhooks/signature.js'
import { ErrorType } from '~/shared/errors.js'

describe('extractWebhookContent', () => {
  it('should extract signature headers into WebhookContent', () => {
    const rawBody = '{"kind":"ExtensionAddedToContext"}'
    const headers = {
      'x-marketplace-signature-serial': 'serial-123',
      'x-marketplace-signature-algorithm': 'ed25519',
      'x-marketplace-signature': 'c2lnbmF0dXJl',
    }

    const result = extractWebhookContent(rawBody, headers)

    expect(result).toEqual({
      rawBody,
      signatureSerial: 'serial-123',
      signatureAlgorithm: 'ed25519',
      signature: 'c2lnbmF0dXJl',
    })
  })

  it('should default missing headers to empty strings', () => {
    const result = extractWebhookContent('body', {})

    expect(result.signatureSerial).toBe('')
    expect(result.signatureAlgorithm).toBe('')
    expect(result.signature).toBe('')
  })

  it('should handle undefined header values', () => {
    const result = extractWebhookContent('body', {
      'x-marketplace-signature-serial': undefined,
      'x-marketplace-signature-algorithm': undefined,
      'x-marketplace-signature': undefined,
    })

    expect(result.signatureSerial).toBe('')
    expect(result.signatureAlgorithm).toBe('')
    expect(result.signature).toBe('')
  })
})

describe('validateWebhookSignature', () => {
  it('should return true when verifier confirms valid signature', async () => {
    const mockVerifier = {
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as WebhookVerifier

    const content: WebhookContent = {
      rawBody: 'body',
      signatureSerial: 'serial',
      signatureAlgorithm: 'ed25519',
      signature: 'sig',
    }

    const result = await validateWebhookSignature(content, mockVerifier)
    expect(result).toBe(true)
    expect(mockVerifier.verify).toHaveBeenCalledWith(content)
  })

  it('should return false when verifier rejects signature', async () => {
    const mockVerifier = {
      verify: vi.fn().mockResolvedValue(false),
    } as unknown as WebhookVerifier

    const content: WebhookContent = {
      rawBody: 'body',
      signatureSerial: 'serial',
      signatureAlgorithm: 'ed25519',
      signature: 'invalid-sig',
    }

    const result = await validateWebhookSignature(content, mockVerifier)
    expect(result).toBe(false)
  })

  it('should return false when verifier throws (missing headers)', async () => {
    const mockVerifier = {
      verify: vi.fn().mockRejectedValue(new Error('MissingSignatureError')),
    } as unknown as WebhookVerifier

    const content: WebhookContent = {
      rawBody: 'body',
      signatureSerial: '',
      signatureAlgorithm: '',
      signature: '',
    }

    const result = await validateWebhookSignature(content, mockVerifier)
    expect(result).toBe(false)
  })
})

describe('verifyWebhookOrReject', () => {
  it('should return null for valid signatures (proceed with processing)', async () => {
    const mockVerifier = {
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as WebhookVerifier

    const result = await verifyWebhookOrReject(
      '{"kind":"test"}',
      {
        'x-marketplace-signature-serial': 'serial',
        'x-marketplace-signature-algorithm': 'ed25519',
        'x-marketplace-signature': 'valid-sig',
      },
      mockVerifier,
    )

    expect(result).toBeNull()
  })

  it('should return HTTP 401 Response for invalid signatures', async () => {
    const mockVerifier = {
      verify: vi.fn().mockResolvedValue(false),
    } as unknown as WebhookVerifier

    const result = await verifyWebhookOrReject(
      '{"kind":"test"}',
      {
        'x-marketplace-signature-serial': 'serial',
        'x-marketplace-signature-algorithm': 'ed25519',
        'x-marketplace-signature': 'bad-sig',
      },
      mockVerifier,
    )

    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(401)

    const body = await result?.json()
    expect(body.type).toBe(ErrorType.AUTH_ERROR)
    expect(body.retryable).toBe(false)
  })

  it('should return HTTP 401 when signature headers are missing', async () => {
    const mockVerifier = {
      verify: vi.fn().mockRejectedValue(new Error('MissingSignatureError')),
    } as unknown as WebhookVerifier

    const result = await verifyWebhookOrReject('body', {}, mockVerifier)

    expect(result).toBeInstanceOf(Response)
    expect(result?.status).toBe(401)
  })

  it('should pass correct WebhookContent to verifier', async () => {
    const mockVerifier = {
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as WebhookVerifier

    const rawBody = '{"id":"webhook-1"}'
    const headers = {
      'x-marketplace-signature-serial': 'my-serial',
      'x-marketplace-signature-algorithm': 'ed25519',
      'x-marketplace-signature': 'my-signature',
    }

    await verifyWebhookOrReject(rawBody, headers, mockVerifier)

    expect(mockVerifier.verify).toHaveBeenCalledWith({
      rawBody,
      signatureSerial: 'my-serial',
      signatureAlgorithm: 'ed25519',
      signature: 'my-signature',
    })
  })
})
