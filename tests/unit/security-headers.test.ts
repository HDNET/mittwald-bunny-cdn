import { describe, expect, it } from 'vitest'
import { buildCsp, buildSecurityHeaders, PERMISSIONS_POLICY } from '~/server/middleware/security-headers.js'

/**
 * Locks in the exact header shape that the mittwald extension host expects
 * and that the validator checks for. If one of these assertions changes,
 * review whether the breakage is intentional — e.g. a new mittwald preview
 * host would add another `frame-ancestors` entry.
 */

describe('buildCsp', () => {
  it('allows the three mittwald frame hosts in production', () => {
    const csp = buildCsp(false)
    expect(csp).toContain('https://*.mittwald.de')
    expect(csp).toContain('https://*.mittwald.systems')
    expect(csp).toContain('https://*.mittwald.it')
  })

  it('never allows localhost or zrok as frame ancestor in production', () => {
    const csp = buildCsp(false)
    expect(csp).not.toContain('localhost')
    expect(csp).not.toContain('zrok')
  })

  it('also allows localhost and zrok frame ancestors in dev', () => {
    const csp = buildCsp(true)
    expect(csp).toContain('http://localhost:*')
    expect(csp).toContain('https://*.share.zrok.io')
  })

  it("allows 'unsafe-inline' for script-src in both dev and prod", () => {
    // tanstack-start emits inline <script> tags for streaming hydration that
    // we cannot turn off, so the strict variant breaks SSR hydration in the
    // mStudio iframe. See security-headers.ts for the full reasoning.
    expect(buildCsp(true)).toContain("script-src 'self' 'unsafe-inline'")
    expect(buildCsp(false)).toContain("script-src 'self' 'unsafe-inline'")
  })

  it('locks connect-src to our own origin plus bunny.net and mittwald APIs', () => {
    const csp = buildCsp(false)
    expect(csp).toContain("connect-src 'self' https://api.bunny.net https://api.mittwald.de")
  })

  it('applies every directive separated by semicolons', () => {
    // Sanity — every directive in the policy should end with a semicolon when
    // joined, except the last one. We assert on directive count as a proxy.
    const csp = buildCsp(false)
    const directives = csp.split('; ')
    expect(directives.length).toBeGreaterThanOrEqual(7)
    expect(directives[0]).toBe("default-src 'self'")
  })
})

describe('buildSecurityHeaders', () => {
  it('returns the expected set of security headers', () => {
    const headers = buildSecurityHeaders(false)
    expect(Object.keys(headers).sort()).toEqual([
      'Content-Security-Policy',
      'Permissions-Policy',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
    ])
  })

  it('sets HSTS with a year-long max-age and includeSubDomains', () => {
    expect(buildSecurityHeaders(false)['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains')
  })

  it('sets X-Content-Type-Options to nosniff', () => {
    expect(buildSecurityHeaders(false)['X-Content-Type-Options']).toBe('nosniff')
  })

  it('sets a strict-origin-when-cross-origin referrer policy', () => {
    expect(buildSecurityHeaders(false)['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('delegates CSP to buildCsp and reflects the dev flag', () => {
    const prod = buildSecurityHeaders(false)['Content-Security-Policy']
    const dev = buildSecurityHeaders(true)['Content-Security-Policy']
    expect(prod).toBe(buildCsp(false))
    expect(dev).toBe(buildCsp(true))
    expect(prod).not.toBe(dev)
  })
})

describe('PERMISSIONS_POLICY', () => {
  it('disables sensitive-device APIs (camera, mic, geolocation, payment, USB)', () => {
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(PERMISSIONS_POLICY).toContain(`${feature}=()`)
    }
  })
})
