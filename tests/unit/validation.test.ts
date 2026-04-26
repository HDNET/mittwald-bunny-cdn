import { describe, expect, it } from 'vitest'
import { isAppError } from '~/shared/errors.js'
import { isBunnyApiKeyFormat, validateCdnMode, validateNonEmpty, validateUrl } from '~/shared/validation.js'

describe('isBunnyApiKeyFormat', () => {
  it('accepts a UUID-shaped 36-char key', () => {
    expect(isBunnyApiKeyFormat('12345678-1234-1234-1234-123456789abc')).toBe(true)
  })

  it('accepts longer multi-part BunnyCDN-style keys', () => {
    expect(isBunnyApiKeyFormat('abcdef12-3456-7890-abcd-ef1234567890-aaaa-bbbb-cccc')).toBe(true)
  })

  it('rejects strings shorter than 36 characters', () => {
    expect(isBunnyApiKeyFormat('abc123')).toBe(false)
  })

  it('rejects strings with whitespace or special characters', () => {
    expect(isBunnyApiKeyFormat('12345678-1234-1234-1234-123456789ab cdef')).toBe(false)
    expect(isBunnyApiKeyFormat('12345678!1234!1234!1234!123456789abcdef')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isBunnyApiKeyFormat('')).toBe(false)
  })

  it('rejects strings over 128 characters', () => {
    expect(isBunnyApiKeyFormat('a'.repeat(129))).toBe(false)
  })
})

describe('validateNonEmpty', () => {
  it('returns trimmed value for valid strings', () => {
    expect(validateNonEmpty('  hello  ', 'Field')).toBe('hello')
  })

  it('throws AppError for empty/whitespace strings', () => {
    try {
      validateNonEmpty('   ', 'API Key')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('VALIDATION_ERROR')
      expect(isAppError(e) && e.message).toMatch(/API Key/)
    }
  })

  it('throws for non-string input', () => {
    try {
      validateNonEmpty(42, 'Field')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('VALIDATION_ERROR')
    }
  })
})

describe('validateUrl', () => {
  it('accepts https URLs with public hostnames', () => {
    expect(validateUrl('https://example.com', 'Origin')).toBe('https://example.com')
  })

  it('rejects internal/private addresses', () => {
    for (const url of ['http://127.0.0.1', 'http://localhost', 'http://10.0.0.1', 'http://192.168.1.1']) {
      try {
        validateUrl(url, 'Origin')
        throw new Error(`expected throw for ${url}`)
      } catch (e) {
        expect(isAppError(e) && e.type).toBe('VALIDATION_ERROR')
      }
    }
  })

  it('rejects non-HTTP protocols', () => {
    try {
      validateUrl('ftp://example.com', 'Origin')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('VALIDATION_ERROR')
    }
  })
})

describe('validateCdnMode', () => {
  it('accepts "asset" and "full-site"', () => {
    expect(validateCdnMode('asset')).toBe('asset')
    expect(validateCdnMode('full-site')).toBe('full-site')
  })

  it('rejects anything else', () => {
    try {
      validateCdnMode('bogus')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('VALIDATION_ERROR')
    }
  })
})
