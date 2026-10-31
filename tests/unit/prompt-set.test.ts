import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Sample } from '@/ai/eval/run'
import { detectLanguage, splitParagraphs } from '@/ai/pipeline/prepare'

// The prompt test set itself stays usable: every sample is complete, in its language, and
// splits into enough paragraphs to make a map.
const dir = join(import.meta.dirname, '..', 'prompt-set', 'samples')
const samples = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, s: JSON.parse(readFileSync(join(dir, f), 'utf8')) as Sample }))

describe('prompt test set samples', () => {
  it('cover all three languages and both modes', () => {
    expect(new Set(samples.map(({ s }) => s.language))).toEqual(new Set(['en', 'de', 'ar']))
    expect(new Set(samples.map(({ s }) => s.mode))).toEqual(new Set(['textbook', 'notes']))
  })

  it.each(samples)('$file is well formed', ({ file, s }) => {
    expect(file).toBe(`${s.id}.json`)
    expect(s.title.length).toBeGreaterThan(3)
    expect(splitParagraphs(s.text).length).toBeGreaterThanOrEqual(6)
    expect(detectLanguage(s.text).lang).toBe(s.language)
  })
})
