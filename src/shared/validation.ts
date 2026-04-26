import { createAppError, ErrorType } from '~/shared/errors'

export function validateNonEmpty(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createAppError(ErrorType.VALIDATION_ERROR, `${fieldName} darf nicht leer sein.`, {
      retryable: false,
      code: 'EMPTY_FIELD',
      variables: { field: fieldName },
    })
  }
  return value.trim()
}

export function validateUrl(value: string, fieldName: string): string {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol')
    const h = url.hostname
    if (
      h === 'localhost' ||
      h.startsWith('127.') ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      h === '0.0.0.0' ||
      h === '[::1]'
    ) {
      throw new Error('Internal address')
    }
    return value
  } catch {
    throw createAppError(ErrorType.VALIDATION_ERROR, `${fieldName} ist keine gültige URL.`, {
      retryable: false,
      code: 'INVALID_URL',
      variables: { field: fieldName },
    })
  }
}

export function validateCdnMode(value: unknown): 'asset' | 'full-site' {
  if (value !== 'asset' && value !== 'full-site') {
    throw createAppError(ErrorType.VALIDATION_ERROR, "CDN-Modus muss 'asset' oder 'full-site' sein.", {
      retryable: false,
      code: 'INVALID_CDN_MODE',
    })
  }
  return value
}

/**
 * Shape check for a BunnyCDN account API key. BunnyCDN keys are UUID-like
 * alphanumeric strings with hyphens, typically 36+ characters. This is a
 * cheap client-side pre-filter against typos; the authoritative check lives
 * on the server (`bunny.validateApiKey()` hits the BunnyCDN `/apikey`
 * endpoint).
 */
export function isBunnyApiKeyFormat(value: string): boolean {
  return /^[A-Za-z0-9-]{36,128}$/.test(value)
}
