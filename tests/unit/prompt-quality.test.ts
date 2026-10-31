import { describe, expect, it } from 'vitest'
import { scoreRun, type SectionResult } from '@/ai/eval/quality'
import type { DetailsResponse } from '@/ai/schemas/details'
import type { OutlineResponse } from '@/ai/schemas/outline'

type Block = DetailsResponse['blocks'][number]

const block = (key: string, source: number[], extra: Partial<Block> = {}): Block => ({
  key,
  parent: null,
  title: 'Osmosis',
  summary: 'Water moves across a membrane.',
  type: 'concept',
  importance: 'supporting',
  details: [],
  source,
  added: false,
  ...extra,
})

const details = (blocks: Block[]): DetailsResponse =>
  ({ blocks, relations: [], flashcards: [] }) as unknown as DetailsResponse

const outline = {
  sections: [
    {
      title: 'Membranes',
      summary: 'How cells control what enters.',
      shape: 'tree',
      paragraphs: { from: 1, to: 4 },
      subsections: [],
    },
  ],
} as unknown as OutlineResponse

describe('prompt quality scoring (Phase 7.7)', () => {
  it('a faithful, complete run scores high', () => {
    const s: SectionResult[] = [
      {
        title: 'Membranes',
        paragraphs: { from: 1, to: 4 },
        details: details([
          block('a', [1, 2], { importance: 'core' }),
          block('b', [3]),
          block('c', [4]),
        ]),
      },
    ]
    const r = scoreRun(4, outline, s)
    expect(r).toMatchObject({ coverage: 1, missing: [], unsourced: 0, outOfRange: 0, blocks: 3 })
    expect(r.score).toBe(100)
  })

  it('counts missing paragraphs, unsourced and out-of-range blocks', () => {
    const s: SectionResult[] = [
      {
        title: 'Membranes',
        paragraphs: { from: 1, to: 4 },
        details: details([
          block('a', [1]),
          block('b', []), // not sourced, not marked added
          block('c', [], { added: true }), // added on purpose: fine
          block('d', [9]), // outside the section
        ]),
      },
    ]
    const r = scoreRun(4, outline, s)
    expect(r.missing).toEqual([2, 3, 4])
    expect(r.coverage).toBe(0.25)
    expect(r).toMatchObject({ unsourced: 1, added: 1, outOfRange: 1 })
    expect(r.score).toBeLessThan(50)
  })

  it('crowded parents and long titles lower the visual part', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      block(`k${i}`, [1 + (i % 4)], { title: 'a very long title that goes on and on' }),
    )
    const r = scoreRun(4, outline, [
      { title: 'Membranes', paragraphs: { from: 1, to: 4 }, details: details(many) },
    ])
    expect(r.crowded).toBe(1)
    expect(r.warnings.title_words).toBe(9)
    expect(r.coverage).toBe(1)
    expect(r.score).toBe(80) // coverage and faithfulness full, visual rules none
  })

  it('failed sections and a failed outline cost their share', () => {
    const ok = {
      title: 'A',
      paragraphs: { from: 1, to: 2 },
      details: details([block('a', [1, 2])]),
    }
    const failed = { title: 'B', paragraphs: { from: 3, to: 4 }, details: null, error: 'invalid' }
    const r = scoreRun(4, outline, [ok, failed])
    expect(r.failedSections).toBe(1)
    expect(r.score).toBeLessThanOrEqual(50)
    expect(scoreRun(4, null, []).score).toBe(0)
  })
})
