import { describe, expect, it } from 'vitest'
import { ar } from '@/locales/ar'
import { de } from '@/locales/de'
import { en } from '@/locales/en'

type Tree = { [k: string]: string | Tree | undefined }

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.set(key, v)
    else if (v) for (const [lk, lv] of leaves(v, key)) out.set(lk, lv)
  }
  return out
}

const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '')

describe.each([
  ['ar', ar],
  ['de', de],
])('%s locale', (_name, locale) => {
  const reference = leaves(en as unknown as Tree)
  const translated = leaves(locale as unknown as Tree)

  it('has every English key, non-empty', () => {
    for (const key of reference.keys()) {
      expect(translated.get(key), key).toBeTruthy()
    }
  })

  it('only adds plural forms beyond the English keys', () => {
    const baseKeys = new Set([...reference.keys()].map(base))
    for (const key of translated.keys()) expect(baseKeys.has(base(key)), key).toBe(true)
  })

  it('keeps the same {{placeholders}}', () => {
    for (const [key, value] of translated) {
      const en = reference.get(key) ?? reference.get(`${base(key)}_other`)
      if (!en) continue
      // Plural forms such as "خريطتان" may legitimately omit {{count}}.
      const expected = placeholders(en).filter(
        (p) => !(p === 'count' && key !== `${base(key)}_other`),
      )
      for (const p of expected) expect(placeholders(value), key).toContain(p)
    }
  })
})
