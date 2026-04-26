import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('Project Setup', () => {
  it('should have vitest working', () => {
    expect(1 + 1).toBe(2)
  })

  it('should have fast-check working', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a)
      }),
    )
  })
})
