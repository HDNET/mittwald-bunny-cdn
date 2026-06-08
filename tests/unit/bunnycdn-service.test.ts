import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEdgeRule,
  addHostname,
  createPullZone,
  createTypo3CookieEdgeRule,
  deletePullZone,
  enableFreeSsl,
  ensureCustomHostnameSsl,
  getPullZone,
  purgeCache,
  setForceSsl,
  setupFullSiteCdn,
  validateApiKey,
} from '~/server/bunnycdn.js'
import { ErrorType } from '~/shared/errors.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('validateApiKey', () => {
  it('should return true for valid API key', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))
    expect(await validateApiKey('valid-key')).toBe(true)
  })

  it('should return false for invalid API key', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 401 }))
    expect(await validateApiKey('bad-key')).toBe(false)
  })

  it('should return false on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    expect(await validateApiKey('any-key')).toBe(false)
  })

  it('should call /apikey endpoint with AccessKey header', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))
    await validateApiKey('my-key')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bunny.net/apikey',
      expect.objectContaining({
        headers: expect.objectContaining({ AccessKey: 'my-key' }),
      }),
    )
  })
})

describe('createPullZone', () => {
  it('should create a pull zone and return id, name, cdnDomain', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          Id: 12345,
          Name: 'my-zone',
          Hostnames: [{ Value: 'my-zone.b-cdn.net' }],
        }),
        { status: 201 },
      ),
    )

    const result = await createPullZone({
      name: 'my-zone',
      originUrl: 'https://example.com',
      apiKey: 'key',
    })

    expect(result.id).toBe(12345)
    expect(result.name).toBe('my-zone')
    expect(result.cdnDomain).toBe('my-zone.b-cdn.net')
  })

  it('should send OriginUrl and AddHostHeader in request body', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ Id: 1, Name: 'z', Hostnames: [{ Value: 'z.b-cdn.net' }] }), { status: 201 }),
    )

    await createPullZone({
      name: 'z',
      originUrl: 'https://example.de',
      apiKey: 'key',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.OriginUrl).toBe('https://example.de')
    expect(body.Name).toBe('z')
  })

  it('should throw BUNNY_API_ERROR on 401', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }))

    await expect(createPullZone({ name: 'z', originUrl: 'https://x.com', apiKey: 'bad' })).rejects.toMatchObject({
      type: ErrorType.BUNNY_API_ERROR,
      retryable: false,
    })
  })

  it('should throw with retryable=true on 500', async () => {
    mockFetch.mockResolvedValue(new Response('Server Error', { status: 500 }))

    await expect(createPullZone({ name: 'z', originUrl: 'https://x.com', apiKey: 'key' })).rejects.toMatchObject({
      type: ErrorType.BUNNY_API_ERROR,
      retryable: true,
    })
  })
})

describe('deletePullZone', () => {
  it('should succeed on 204', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    await expect(deletePullZone(123, 'key')).resolves.toBeUndefined()
  })

  it('should succeed silently on 404 (already deleted)', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 404 }))
    await expect(deletePullZone(123, 'key')).resolves.toBeUndefined()
  })

  it('should throw on 500', async () => {
    mockFetch.mockResolvedValue(new Response('Error', { status: 500 }))
    await expect(deletePullZone(123, 'key')).rejects.toMatchObject({
      type: ErrorType.BUNNY_API_ERROR,
    })
  })
})

describe('getPullZone', () => {
  it('should return pull zone info', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          Id: 99,
          Name: 'test',
          Hostnames: [{ Value: 'test.b-cdn.net' }],
          OriginUrl: 'https://origin.de',
          Enabled: true,
        }),
        { status: 200 },
      ),
    )

    const result = await getPullZone(99, 'key')
    expect(result).toMatchObject({
      id: 99,
      name: 'test',
      cdnDomain: 'test.b-cdn.net',
      originUrl: 'https://origin.de',
      enabled: true,
    })
  })

  it('should return null on 404', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }))
    expect(await getPullZone(999, 'key')).toBeNull()
  })
})

describe('purgeCache', () => {
  it('should POST to purgeCache endpoint', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    await purgeCache(42, 'key')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bunny.net/pullzone/42/purgeCache',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('createTypo3CookieEdgeRule', () => {
  it('should create a disable-caching rule for fe_typo_user cookie', () => {
    const rule = createTypo3CookieEdgeRule()

    expect(rule.actionType).toBe(15)
    expect(rule.enabled).toBe(true)
    expect(rule.triggers[0].type).toBe(3)
    expect(rule.triggers[0].patternMatches).toEqual(['fe_typo_user=*'])
  })
})

describe('addEdgeRule', () => {
  it('should POST edge rule to correct endpoint', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }))

    const rule = createTypo3CookieEdgeRule()
    await addEdgeRule(42, rule, 'key')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bunny.net/pullzone/42/edgerules/addOrUpdate',
      expect.objectContaining({ method: 'POST' }),
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.ActionType).toBe(15)
    expect(body.Enabled).toBe(true)
    expect(body.Triggers[0].Type).toBe(3)
  })
})

describe('addHostname', () => {
  it('should POST hostname to correct endpoint', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    await addHostname(42, 'www.example.com', 'key')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bunny.net/pullzone/addHostname',
      expect.objectContaining({ method: 'POST' }),
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.PullZoneId).toBe(42)
    expect(body.Hostname).toBe('www.example.com')
  })
})

describe('enableFreeSsl', () => {
  it('should GET loadFreeCertificate with hostname param', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await enableFreeSsl(42, 'www.example.com', 'key')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bunny.net/pullzone/loadFreeCertificate?hostname=www.example.com',
      expect.objectContaining({
        headers: expect.objectContaining({ AccessKey: 'key' }),
      }),
    )
  })

  it('swallows a non-2xx response (DNS not ready yet) without throwing', async () => {
    mockFetch.mockResolvedValue(new Response('certificate validation failed', { status: 400 }))

    await expect(enableFreeSsl(42, 'www.example.com', 'key')).resolves.toBeUndefined()
  })
})

describe('setForceSsl', () => {
  it('POSTs Hostname + ForceSSL to setForceSSL', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await setForceSsl(42, 'www.example.com', true, 'key')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bunny.net/pullzone/42/setForceSSL',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ Hostname: 'www.example.com', ForceSSL: true }),
      }),
    )
  })
})

describe('ensureCustomHostnameSsl', () => {
  const hostnames = (over: Partial<{ hasCertificate: boolean; forceSsl: boolean }> = {}) => [
    { value: 'zone.b-cdn.net', hasCertificate: true, forceSsl: false },
    { value: 'www.example.com', hasCertificate: false, forceSsl: false, ...over },
  ]

  it('triggers the free certificate once DNS resolves and no cert exists', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await ensureCustomHostnameSsl(42, hostnames(), true, 'key')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('loadFreeCertificate?hostname=www.example.com')
  })

  it('does nothing while DNS is not yet pointed at the zone', async () => {
    await ensureCustomHostnameSsl(42, hostnames(), false, 'key')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('enables Force SSL once the certificate is present', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await ensureCustomHostnameSsl(42, hostnames({ hasCertificate: true, forceSsl: false }), true, 'key')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('/pullzone/42/setForceSSL')
  })

  it('is a no-op when cert exists and Force SSL is already on', async () => {
    await ensureCustomHostnameSsl(42, hostnames({ hasCertificate: true, forceSsl: true }), true, 'key')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does nothing when there is no custom hostname', async () => {
    await ensureCustomHostnameSsl(42, [{ value: 'zone.b-cdn.net', hasCertificate: true, forceSsl: false }], true, 'key')

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('setupFullSiteCdn', () => {
  it('should call addEdgeRule, addHostname, and enableFreeSsl', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))

    await setupFullSiteCdn(42, 'www.example.com', 'key')

    expect(mockFetch).toHaveBeenCalledTimes(3)

    const urls = mockFetch.mock.calls.map((c: string[]) => c[0])
    expect(urls[0]).toContain('edgerules/addOrUpdate')
    expect(urls[1]).toContain('addHostname')
    expect(urls[2]).toContain('loadFreeCertificate')
  })
})

describe('createPullZone — adoption flow', () => {
  // bunny.net pull-zone names are globally unique. When POST returns the
  // `pullzone.name_taken` error, createPullZone calls findPullZoneByName to
  // see whether the existing zone lives in *our* account, and adopts it if so.

  it('adopts an existing pull zone when name is taken in our account and origins match', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ErrorKey: 'pullzone.name_taken' }), { status: 400 }))
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            Id: 9001,
            Name: 'testzone',
            Hostnames: [{ Value: 'testzone.b-cdn.net', HasCertificate: true }],
            OriginUrl: 'https://example.com',
            Enabled: true,
            EnableGeoZoneEU: true,
            EnableGeoZoneUS: true,
            EnableGeoZoneASIA: true,
            EnableGeoZoneSA: true,
            EnableGeoZoneAF: true,
          },
        ]),
        { status: 200 },
      ),
    )

    const result = await createPullZone({ name: 'testzone', originUrl: 'https://example.com', apiKey: 'key' })

    expect(result).toEqual({
      id: 9001,
      name: 'testzone',
      cdnDomain: 'testzone.b-cdn.net',
      adopted: true,
    })
  })

  it('throws PULL_ZONE_ORIGIN_MISMATCH when the existing zone has a different origin', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ErrorKey: 'pullzone.name_taken' }), { status: 400 }))
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            Id: 9002,
            Name: 'testzone',
            Hostnames: [{ Value: 'testzone.b-cdn.net' }],
            OriginUrl: 'https://different.com',
            Enabled: true,
            EnableGeoZoneEU: true,
            EnableGeoZoneUS: true,
            EnableGeoZoneASIA: true,
            EnableGeoZoneSA: true,
            EnableGeoZoneAF: true,
          },
        ]),
        { status: 200 },
      ),
    )

    await expect(
      createPullZone({ name: 'testzone', originUrl: 'https://example.com', apiKey: 'key' }),
    ).rejects.toMatchObject({ code: 'PULL_ZONE_ORIGIN_MISMATCH', type: ErrorType.BUNNY_API_ERROR })
  })

  it('throws PULL_ZONE_NAME_GLOBAL_TAKEN when the name is taken outside our account', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ErrorKey: 'pullzone.name_taken' }), { status: 400 }))
    // Search returns empty — name is taken globally but not by us.
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))

    await expect(
      createPullZone({ name: 'globaltaken', originUrl: 'https://example.com', apiKey: 'key' }),
    ).rejects.toMatchObject({ code: 'PULL_ZONE_NAME_GLOBAL_TAKEN', type: ErrorType.BUNNY_API_ERROR })
  })

  it('rethrows non-name-taken errors unchanged', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }))

    await expect(
      createPullZone({ name: 'whatever', originUrl: 'https://example.com', apiKey: 'key' }),
    ).rejects.toMatchObject({ code: 'BUNNY_API_ERROR', type: ErrorType.BUNNY_API_ERROR })
  })
})

describe('bunnyFetch / bunnyRequest edge cases', () => {
  it('createPullZone surfaces BUNNY_TIMEOUT when fetch aborts', async () => {
    // Simulate AbortController firing — global fetch rejects with an
    // AbortError instance.
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    mockFetch.mockRejectedValue(abortError)

    await expect(createPullZone({ name: 'x', originUrl: 'https://example.com', apiKey: 'key' })).rejects.toMatchObject({
      code: 'BUNNY_TIMEOUT',
      type: ErrorType.NETWORK_ERROR,
    })
  })

  it('purgeCache succeeds even when the response body is empty (200 + no body)', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    // No throw, undefined return — exercises the `if (!text) return undefined`
    // branch in bunnyRequest.
    await expect(purgeCache(42, 'key')).resolves.toBeUndefined()
  })
})
