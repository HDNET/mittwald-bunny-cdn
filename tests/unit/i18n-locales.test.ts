import { describe, expect, it } from 'vitest'
import de from '~/i18n/locales/de.json'
import en from '~/i18n/locales/en.json'

/**
 * Guard rails for our translation bundles:
 *
 * 1. Every key defined in the DE master copy must also exist in EN, and
 *    vice versa. Missing keys fall back to the other locale at runtime,
 *    but silently — this test makes such drift loud during CI.
 *
 * 2. Every `{{variable}}` interpolation in a DE string must be present in
 *    the matching EN string (and vice versa). A mismatched variable name
 *    would render as a literal `{{foo}}` in one locale.
 */

type AnyRecord = Record<string, unknown>

function flatten(obj: AnyRecord, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out[path] = value
    } else if (value && typeof value === 'object') {
      Object.assign(out, flatten(value as AnyRecord, path))
    }
  }
  return out
}

function variables(value: string): Set<string> {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  const found = new Set<string>()
  for (const match of value.matchAll(re)) found.add(match[1])
  return found
}

describe('i18n locale bundles', () => {
  const flatDe = flatten(de as AnyRecord)
  const flatEn = flatten(en as AnyRecord)

  it('DE and EN expose the same keys', () => {
    const deKeys = new Set(Object.keys(flatDe))
    const enKeys = new Set(Object.keys(flatEn))
    const missingInEn = [...deKeys].filter((k) => !enKeys.has(k)).sort()
    const missingInDe = [...enKeys].filter((k) => !deKeys.has(k)).sort()
    expect(missingInEn, `keys present in DE but missing in EN:\n${missingInEn.join('\n')}`).toEqual([])
    expect(missingInDe, `keys present in EN but missing in DE:\n${missingInDe.join('\n')}`).toEqual([])
  })

  it('every {{variable}} in DE also appears in EN (and vice versa)', () => {
    const mismatches: string[] = []
    for (const key of Object.keys(flatDe)) {
      const enValue = flatEn[key]
      if (enValue === undefined) continue
      const deVars = variables(flatDe[key])
      const enVars = variables(enValue)
      const onlyDe = [...deVars].filter((v) => !enVars.has(v))
      const onlyEn = [...enVars].filter((v) => !deVars.has(v))
      if (onlyDe.length > 0 || onlyEn.length > 0) {
        mismatches.push(`${key}: DE-only=[${onlyDe.join(',')}] EN-only=[${onlyEn.join(',')}]`)
      }
    }
    expect(mismatches, `variable mismatch:\n${mismatches.join('\n')}`).toEqual([])
  })
})
