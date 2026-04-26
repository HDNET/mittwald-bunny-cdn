import type { MittwaldAPIV2Client } from '@mittwald/api-client'
import { describe, expect, it, vi } from 'vitest'
import { getProjectRole, requireProjectRole } from '~/server/membership.js'
import { isAppError } from '~/shared/errors.js'

function makeClient(res: { status: number; data?: { role: string } } | Error) {
  const getSelfMembershipForProject = vi.fn(async () => {
    if (res instanceof Error) throw res
    return res
  })
  return {
    project: { getSelfMembershipForProject },
  } as unknown as MittwaldAPIV2Client
}

describe('getProjectRole', () => {
  it('returns allowed=true when role is in allowlist', async () => {
    const client = makeClient({ status: 200, data: { role: 'owner' } })
    const result = await getProjectRole(client, 'proj-1')
    expect(result).toEqual({ role: 'owner', allowed: true })
  })

  it('returns allowed=false when role is not in allowlist', async () => {
    const client = makeClient({ status: 200, data: { role: 'emailadmin' } })
    const result = await getProjectRole(client, 'proj-1')
    expect(result).toEqual({ role: 'emailadmin', allowed: false })
  })

  it('treats 403 as role=null, allowed=false (non-throwing)', async () => {
    const client = makeClient({ status: 403 })
    const result = await getProjectRole(client, 'proj-1')
    expect(result).toEqual({ role: null, allowed: false })
  })

  it('treats thrown errors as role=null, allowed=false', async () => {
    const client = makeClient(new Error('network down'))
    const result = await getProjectRole(client, 'proj-1')
    expect(result).toEqual({ role: null, allowed: false })
  })

  it('respects a custom allowlist', async () => {
    const client = makeClient({ status: 200, data: { role: 'external' } })
    const result = await getProjectRole(client, 'proj-1', ['owner', 'external'])
    expect(result).toEqual({ role: 'external', allowed: true })
  })
})

describe('requireProjectRole', () => {
  it('resolves quietly when role is in allowlist', async () => {
    const client = makeClient({ status: 200, data: { role: 'owner' } })
    await expect(requireProjectRole(client, 'proj-1')).resolves.toBeUndefined()
  })

  it('throws an AUTH_ERROR when role is not in allowlist', async () => {
    const client = makeClient({ status: 200, data: { role: 'emailadmin' } })
    try {
      await requireProjectRole(client, 'proj-1')
      throw new Error('expected throw')
    } catch (e) {
      expect(isAppError(e) && e.type).toBe('AUTH_ERROR')
      expect(isAppError(e) && e.message).toMatch(/Administrator/i)
      expect(isAppError(e) && e.message).toMatch(/emailadmin/)
    }
  })

  it('proceeds optimistically when role could not be determined (missing scope)', async () => {
    const client = makeClient({ status: 403 })
    // Should NOT throw — lets the downstream API enforce permissions
    await expect(requireProjectRole(client, 'proj-1')).resolves.toBeUndefined()
  })
})
