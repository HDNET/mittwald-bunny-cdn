import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEdgeRule,
  addHostname,
  createPullZone,
  createTypo3CookieEdgeRule,
  deletePullZone,
  enableFreeSsl,
  getPullZone,
  purgeCache,
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
