import { promises as dnsPromises } from 'node:dns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkDnsCname } from '~/server/bunnycdn.js'

vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn(),
    resolveCname: vi.fn(),
  },
}))

const mockResolveCname = dnsPromises.resolveCname as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockResolveCname.mockReset()
})

describe('checkDnsCname', () => {
  it('returns true when CNAME exactly matches', async () => {
    mockResolveCname.mockResolvedValue(['xyz.b-cdn.net'])
    expect(await checkDnsCname('cdn.example.com', 'xyz.b-cdn.net')).toBe(true)
  })

  it('is case-insensitive', async () => {
    mockResolveCname.mockResolvedValue(['XYZ.B-CDN.NET'])
    expect(await checkDnsCname('cdn.example.com', 'xyz.b-cdn.net')).toBe(true)
  })

  it('returns true when expected value is somewhere in the chain', async () => {
    mockResolveCname.mockResolvedValue(['intermediate.example.com', 'xyz.b-cdn.net'])
    expect(await checkDnsCname('cdn.example.com', 'xyz.b-cdn.net')).toBe(true)
  })

  it('returns false when CNAME points elsewhere', async () => {
    mockResolveCname.mockResolvedValue(['other.cdn.net'])
    expect(await checkDnsCname('cdn.example.com', 'xyz.b-cdn.net')).toBe(false)
  })

  it('returns false on NXDOMAIN (dns lookup throws)', async () => {
    mockResolveCname.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
    expect(await checkDnsCname('missing.example.com', 'xyz.b-cdn.net')).toBe(false)
  })
})
