import { describe, expect, it } from 'vitest'
import { deriveDnsTarget, deriveSslStatus } from '~/server/health-helpers.js'

describe('deriveDnsTarget', () => {
  it('returns cdn.<hostname> for asset-CDN', () => {
    expect(deriveDnsTarget('asset', 'https://example.com', [])).toBe('cdn.example.com')
  })

  it('returns cdn.<hostname> without port/path', () => {
    expect(deriveDnsTarget('asset', 'https://example.com:443/foo', [])).toBe('cdn.example.com')
  })

  it('returns null on unparsable URL for asset-CDN', () => {
    expect(deriveDnsTarget('asset', 'not a url', [])).toBeNull()
  })

  it('returns the first non-bunny hostname for full-site', () => {
    expect(
      deriveDnsTarget('full-site', 'https://internal.mittwald.de', [
        { value: 'xyz.b-cdn.net' },
        { value: 'www.example.com' },
      ]),
    ).toBe('www.example.com')
  })

  it('returns null for full-site without a custom hostname', () => {
    expect(deriveDnsTarget('full-site', 'https://internal.mittwald.de', [{ value: 'xyz.b-cdn.net' }])).toBeNull()
  })
})

describe('deriveSslStatus', () => {
  it('always returns ok for asset-CDN', () => {
    expect(deriveSslStatus('asset', [])).toBe('ok')
    expect(deriveSslStatus('asset', [{ value: 'xyz.b-cdn.net', hasCertificate: false }])).toBe('ok')
  })

  it('returns missing for full-site without a custom hostname', () => {
    expect(deriveSslStatus('full-site', [{ value: 'xyz.b-cdn.net', hasCertificate: true }])).toBe('missing')
  })

  it('returns pending when the custom hostname has no cert yet', () => {
    expect(
      deriveSslStatus('full-site', [
        { value: 'xyz.b-cdn.net', hasCertificate: true },
        { value: 'www.example.com', hasCertificate: false },
      ]),
    ).toBe('pending')
  })

  it('returns ok when the custom hostname has a cert', () => {
    expect(
      deriveSslStatus('full-site', [
        { value: 'xyz.b-cdn.net', hasCertificate: true },
        { value: 'www.example.com', hasCertificate: true },
      ]),
    ).toBe('ok')
  })
})
