import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updatePullZoneSettings } from '~/server/bunnycdn.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk() {
  mockFetch.mockResolvedValue(new Response('{}', { status: 200 }))
}

function lastRequestBody() {
  const calls = mockFetch.mock.calls
  const [, init] = calls[calls.length - 1] as [string, RequestInit]
  return JSON.parse(init.body as string) as Record<string, unknown>
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('updatePullZoneSettings', () => {
  it('skips the HTTP call entirely when patch is empty', async () => {
    await updatePullZoneSettings(42, {}, 'key')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('maps enabled → Enabled', async () => {
    mockOk()
    await updatePullZoneSettings(42, { enabled: false }, 'key')
    expect(lastRequestBody()).toEqual({ Enabled: false })
  })

  it('maps smartCache → EnableCacheSlice', async () => {
    mockOk()
    await updatePullZoneSettings(42, { smartCache: true }, 'key')
    expect(lastRequestBody()).toEqual({ EnableCacheSlice: true })
  })

  it('maps optimizer subfields to BunnyCDN PascalCase names', async () => {
    mockOk()
    await updatePullZoneSettings(
      42,
      { optimizer: { image: true, webp: true, avif: false, cssMinify: true, jsMinify: false } },
      'key',
    )
    expect(lastRequestBody()).toEqual({
      EnableImageOptimizer: true,
      EnableWebPVary: true,
      EnableAvifVary: false,
      OptimizerMinifyCSS: true,
      OptimizerMinifyJavaScript: false,
    })
  })

  it('maps cacheTtl subfields to CacheControl*MaxAgeOverride', async () => {
    mockOk()
    await updatePullZoneSettings(42, { cacheTtl: { edge: 3600, browser: -1 } }, 'key')
    expect(lastRequestBody()).toEqual({
      CacheControlMaxAgeOverride: 3600,
      CacheControlBrowserMaxAgeOverride: -1,
    })
  })

  it('maps hotlink.allowedReferrers → AllowedReferrers', async () => {
    mockOk()
    await updatePullZoneSettings(42, { hotlink: { allowedReferrers: ['example.com'] } }, 'key')
    expect(lastRequestBody()).toEqual({ AllowedReferrers: ['example.com'] })
  })

  it('omits undefined subfields', async () => {
    mockOk()
    await updatePullZoneSettings(42, { optimizer: { image: true } }, 'key')
    expect(lastRequestBody()).toEqual({ EnableImageOptimizer: true })
  })

  it('combines multiple patch sections into a single POST', async () => {
    mockOk()
    await updatePullZoneSettings(
      42,
      {
        enabled: true,
        optimizer: { image: true },
        cacheTtl: { edge: 60 },
      },
      'key',
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(lastRequestBody()).toEqual({
      Enabled: true,
      EnableImageOptimizer: true,
      CacheControlMaxAgeOverride: 60,
    })
  })

  it('targets the correct pullzone endpoint', async () => {
    mockOk()
    await updatePullZoneSettings(99, { enabled: false }, 'key')
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.bunny.net/pullzone/99')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).AccessKey).toBe('key')
  })
})
