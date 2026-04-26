import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generateConfigHints } from '~/shared/types.js'

/**
 * Property 10: Konfigurationshinweise tragen die richtigen Domain-Werte.
 *
 * `generateConfigHints` returns i18n keys + interpolation values; these
 * tests inspect the structured output (values + code blocks + status) so
 * they stay independent of the translation content.
 *
 * **Validates: Requirements 9.1, 9.2**
 */

const cdnDomainArb = fc.stringMatching(/^[a-z0-9]{3,20}$/).map((sub) => `${sub}.b-cdn.net`)

const originDomainArb = fc
  .tuple(fc.stringMatching(/^[a-z0-9]{3,15}$/), fc.constantFrom('.de', '.com', '.net', '.org'))
  .map(([sub, tld]) => `${sub}${tld}`)

describe('Feature: mittwald-bunny-cdn, Property 10: Konfigurationshinweise enthalten korrekte Domain-Werte', () => {
  it('asset mode (manual DNS): DNS hint carries CDN domain in its code block, TypoScript points at cdn subdomain', () => {
    fc.assert(
      fc.property(cdnDomainArb, originDomainArb, (cdnDomain, originDomain) => {
        const hints = generateConfigHints({
          cdnDomain,
          originUrl: `https://${originDomain}`,
          cdnMode: 'asset',
          dnsConfigured: false,
        })

        expect(hints.dns.code).toContain(cdnDomain)
        expect(hints.typo3).toBeDefined()
        expect(hints.typo3?.code).toContain(`cdn.${originDomain}`)
      }),
      { numRuns: 100 },
    )
  })

  it('asset mode (auto DNS): DNS hint is OK, no code block, values expose the CDN domain', () => {
    fc.assert(
      fc.property(cdnDomainArb, originDomainArb, (cdnDomain, originDomain) => {
        const hints = generateConfigHints({
          cdnDomain,
          originUrl: `https://${originDomain}`,
          cdnMode: 'asset',
          dnsConfigured: true,
        })

        expect(hints.dns.status).toBe('ok')
        expect(hints.dns.code).toBeUndefined()
        expect(hints.dns.descriptionValues).toMatchObject({ cdnDomain })
      }),
      { numRuns: 100 },
    )
  })

  it('full-site mode: DNS code block carries CDN domain, SSL + cache hints are present, typo3 is not', () => {
    fc.assert(
      fc.property(cdnDomainArb, originDomainArb, (cdnDomain, originDomain) => {
        const hints = generateConfigHints({
          cdnDomain,
          originUrl: `https://${originDomain}`,
          cdnMode: 'full-site',
          hostname: originDomain,
          dnsConfigured: false,
        })

        expect(hints.dns.code).toContain(cdnDomain)
        expect(hints.ssl).toBeDefined()
        expect(hints.cache).toBeDefined()
        expect(hints.typo3).toBeUndefined()
      }),
      { numRuns: 100 },
    )
  })
})
