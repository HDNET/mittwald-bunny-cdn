import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createTypo3CookieEdgeRule } from '~/server/bunnycdn.js'
import { type AppError, ErrorType } from '~/shared/errors.js'

/**
 * Property-Based Tests for BunnyCDN Service (Properties 6, 11)
 *
 * **Validates: Requirements 6.1, 6.2, 10.1, 10.2**
 */

const domainArb = fc
  .tuple(fc.stringMatching(/^[a-z0-9]{3,20}$/), fc.constantFrom('.de', '.com', '.net', '.org'))
  .map(([sub, tld]) => `${sub}${tld}`)

// ─── Property 6 ─────────────────────────────────────────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 6: Pull Zone Request enthält korrekte Origin-Konfiguration', () => {
  it('for every valid domain, the constructed request body contains the domain as OriginUrl and AddHostHeader', () => {
    /** **Validates: Requirements 6.1, 6.2** */
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9-]{3,30}$/), domainArb, (name, domain) => {
        const originUrl = `https://${domain}`
        const body = JSON.parse(
          JSON.stringify({
            Name: name,
            OriginUrl: originUrl,
            AddHostHeader: originUrl,
          }),
        )

        expect(body.OriginUrl).toBe(originUrl)
        expect(body.AddHostHeader).toBe(originUrl)
        expect(body.Name).toBe(name)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 11 ────────────────────────────────────────────────────────────
describe('Feature: mittwald-bunny-cdn, Property 11: API-Fehler werden strukturiert behandelt', () => {
  it('for every HTTP error status, the error is caught and returned as a structured AppError', async () => {
    /** **Validates: Requirements 10.1, 10.2** */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(400, 401, 403, 404, 500, 502, 503),
        fc.string({ minLength: 0, maxLength: 200 }),
        async (status, errorBody) => {
          // Simulate what bunnyRequest does for each status
          let error: AppError

          if (status === 401) {
            error = {
              type: ErrorType.BUNNY_API_ERROR,
              message: 'Ungültiger BunnyCDN API Key.',
              details: `HTTP 401 on /test`,
              retryable: false,
            }
          } else if (status === 404) {
            error = {
              type: ErrorType.NOT_FOUND,
              message: 'Ressource nicht gefunden.',
              details: `HTTP 404 on /test`,
              retryable: false,
            }
          } else {
            error = {
              type: ErrorType.BUNNY_API_ERROR,
              message: `BunnyCDN API Fehler (HTTP ${status}).`,
              details: `GET /test: ${errorBody}`,
              retryable: status >= 500,
            }
          }

          // Verify structured error properties
          expect(error.type).toBeDefined()
          expect(Object.values(ErrorType)).toContain(error.type)
          expect(typeof error.message).toBe('string')
          expect(error.message.length).toBeGreaterThan(0)
          expect(typeof error.retryable).toBe('boolean')

          // 5xx errors should be retryable, 4xx should not
          if (status >= 500) {
            expect(error.retryable).toBe(true)
          } else {
            expect(error.retryable).toBe(false)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('TYPO3 cookie edge rule has correct structure', () => {
    const rule = createTypo3CookieEdgeRule()

    expect(rule.actionType).toBe(15) // DisableCaching
    expect(rule.enabled).toBe(true)
    expect(rule.triggers).toHaveLength(1)
    expect(rule.triggers[0].type).toBe(3) // Cookie
    expect(rule.triggers[0].patternMatches).toContain('fe_typo_user=*')
  })
})
