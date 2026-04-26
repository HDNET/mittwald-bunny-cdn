import { promises as dnsPromises } from 'node:dns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isPrivateOrReservedIp, pingOrigin } from '~/server/bunnycdn.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn(),
    resolveCname: vi.fn(),
  },
}))

const mockLookup = dnsPromises.lookup as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch.mockReset()
  mockLookup.mockReset()
})

describe('isPrivateOrReservedIp', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.42.0.1', true],
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.0.1', true],
    ['169.254.169.254', true], // AWS metadata
    ['100.64.0.1', true], // CGNAT
    ['0.0.0.0', true],
    ['224.0.0.1', true], // multicast
    ['255.255.255.255', true],
    ['::1', true],
    ['::', true],
    ['fe80::1', true],
    ['fc00::1', true],
    ['fd00::1', true],
    ['::ffff:127.0.0.1', true], // IPv4-mapped loopback
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['172.15.0.1', false], // just below private range
    ['172.32.0.1', false], // just above private range
    ['2606:4700:4700::1111', false], // Cloudflare v6
    ['100.63.0.1', false], // just below CGNAT
    ['100.128.0.1', false], // just above CGNAT
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateOrReservedIp(ip)).toBe(expected)
  })
})

describe('pingOrigin', () => {
  it('returns ok for fast public host', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mockFetch.mockImplementation(() => Promise.resolve(new Response('', { status: 200 })))

    const result = await pingOrigin('https://example.com')
    expect(result.status).toBe('ok')
    expect(result.responseMs).toBeGreaterThanOrEqual(0)
  })

  it('returns slow when response takes > 1s', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mockFetch.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(new Response('', { status: 200 })), 1100)),
    )

    const result = await pingOrigin('https://example.com')
    expect(result.status).toBe('slow')
  })

  it('returns down on fetch error', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mockFetch.mockRejectedValue(new Error('boom'))

    const result = await pingOrigin('https://example.com')
    expect(result).toEqual({ status: 'down', responseMs: null })
  })

  it('refuses non-https schemes', async () => {
    const result = await pingOrigin('http://example.com')
    expect(result).toEqual({ status: 'down', responseMs: null })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('refuses private-IP hosts (SSRF guard)', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])

    const result = await pingOrigin('https://metadata.internal')
    expect(result).toEqual({ status: 'down', responseMs: null })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses loopback hosts (SSRF guard)', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    const result = await pingOrigin('https://localhost')
    expect(result).toEqual({ status: 'down', responseMs: null })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses malformed URLs', async () => {
    const result = await pingOrigin('::::not-a-url::::')
    expect(result).toEqual({ status: 'down', responseMs: null })
  })

  it('uses HEAD + manual-redirect (no SSRF via redirect)', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
    mockFetch.mockResolvedValue(new Response('', { status: 200 }))

    await pingOrigin('https://example.com')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ method: 'HEAD', redirect: 'manual' }),
    )
  })
})
