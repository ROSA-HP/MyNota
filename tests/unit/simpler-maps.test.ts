import { describe, expect, it } from 'vitest'
import { makeNode, otherSectionsText } from '@/ai/pipeline/convert'
import { measureCoverage } from '@/ai/pipeline/coverage'
import { MAX_SUB_BLOCKS, foldSmallBlocks } from '@/ai/pipeline/simplify'
import { DETAILS_PROMPT_VERSION, detailsPrompt } from '@/ai/prompts/details.v6'
import { DetailsResponseSchema, detailsSchemaFor } from '@/ai/schemas/details'
import type { OutlineResponse } from '@/ai/schemas/outline'
import { overallCoverage, weakSections } from '@/features/workspace/buildQuality'
import { readingNumbers } from '@/features/workspace/canvas/layout'

// Simpler, better organised maps (owner, 2026-11-03).
type B = {
  key: string
  parent?: string | null
  title?: string
  summary?: string
  type?: 'concept' | 'formula'
  details?: Array<{ kind: 'bullet' | 'formula' | 'example'; text: string }>
  source?: number[]
}
const reply = (blocks: B[], relations: Array<[string, string]> = [], cards: string[] = []) =>
  DetailsResponseSchema.parse({
    blocks: blocks.map((b) => ({
      key: b.key,
      parent: b.parent ?? null,
      title: b.title ?? `Block ${b.key}`,
      summary: b.summary ?? '',
      type: b.type ?? 'concept',
      importance: 'supporting',
      details: b.details ?? [{ kind: 'bullet', text: `More about ${b.key}.` }],
      source: b.source ?? [1],
      added: false,
    })),
    relations: relations.map(([from, to]) => ({ from, to, type: 'causes', label: 'drives it' })),
    flashcards: cards.map((block) => ({ block, front: 'Q', back: 'A' })),
  })

describe('small points become bullets', () => {
  it('folds a sub-block that is only a point into its parent, keeping its words', () => {
    const r = reply([
      { key: 'a', title: 'Series circuits' },
      {
        key: 'b',
        parent: 'a',
        title: 'Same current',
        summary: 'Flows through every part.',
        details: [],
        source: [2],
      },
    ])
    const out = foldSmallBlocks(r)
    expect(out.blocks.map((b) => b.key)).toEqual(['a'])
    expect(out.blocks[0]?.details.at(-1)).toEqual({
      kind: 'bullet',
      text: 'Same current: Flows through every part.',
    })
    expect(out.blocks[0]?.source).toEqual([1, 2])
  })

  it('folds a third level, but never a block with a formula', () => {
    const r = reply([
      { key: 'a' },
      { key: 'b', parent: 'a' },
      { key: 'c', parent: 'b', details: [{ kind: 'bullet', text: 'A deep detail.' }] },
      { key: 'd', parent: 'b', type: 'formula', details: [{ kind: 'formula', text: 'x = y' }] },
    ])
    expect(foldSmallBlocks(r).blocks.map((b) => b.key)).toEqual(['a', 'b', 'd'])
  })

  it(`keeps at most ${MAX_SUB_BLOCKS} sub-blocks, folding the smallest`, () => {
    const kids: B[] = 'bcdefg'.split('').map((k, i) => ({
      key: k,
      parent: 'a',
      summary: 'x'.repeat(10 + i * 10),
      details: [{ kind: 'bullet', text: 'y'.repeat(100 + i * 20) }],
    }))
    const out = foldSmallBlocks(reply([{ key: 'a' }, ...kids]))
    // The two smallest (b, c) became bullets; the four biggest stay as cards.
    expect(out.blocks.filter((b) => b.parent === 'a').map((b) => b.key)).toEqual([
      'd',
      'e',
      'f',
      'g',
    ])
  })

  it('moves links and flashcards with a folded block, and drops a link that loops', () => {
    const r = reply(
      [
        { key: 'a' },
        { key: 'b', parent: 'a', summary: 'Tiny.', details: [] },
        { key: 'c', title: 'Elsewhere' },
      ],
      [
        ['c', 'b'],
        ['a', 'b'],
      ],
      ['b'],
    )
    const out = foldSmallBlocks(r)
    expect(out.relations.map((x) => [x.from, x.to])).toEqual([['c', 'a']])
    expect(out.flashcards.map((f) => f.block)).toEqual(['a'])
    expect(detailsSchemaFor(5).safeParse(out).success).toBe(true)
  })

  it('never folds a main idea', () => {
    const r = reply([
      { key: 'a', summary: 'Tiny.', details: [] },
      { key: 'b', details: [] },
    ])
    expect(foldSmallBlocks(r).blocks).toHaveLength(2)
  })
})

describe('quality report', () => {
  it('measures how much of the notes the reply itself carries', () => {
    const r = reply([
      { key: 'a', title: 'Ohm law', summary: 'Current grows with voltage across resistors.' },
    ])
    const ps = [
      {
        n: 1,
        text: 'Current grows with voltage across a resistor.\nCapacitors store electric charge between plates.',
      },
    ]
    expect(measureCoverage(r, ps)).toEqual({ points: 2, missed: 1 })
  })

  it('names weak sections and the share mapped overall', () => {
    const q = {
      good: { title: 'Good', points: 10, missed: 1, formulas: 2, blocks: 8 },
      gaps: { title: 'Gaps', points: 8, missed: 4, formulas: 0, blocks: 5 },
      crowd: { title: 'Crowd', points: 10, missed: 0, formulas: 0, blocks: 20 },
      thin: { title: 'Thin', points: 6, missed: 0, formulas: 0, blocks: 1 },
    }
    expect(weakSections(q)).toEqual(['gaps', 'crowd', 'thin'])
    expect(overallCoverage(q)).toBeCloseTo(29 / 34, 5)
    expect(overallCoverage({})).toBeNull()
  })
})

describe('numbered reading order', () => {
  const MAP = 'm'
  it('numbers sections, blocks and sub-blocks in map order', () => {
    const root = makeNode({ map_id: MAP, level: 'chapter', title: 'Notes' })
    const s1 = makeNode({
      map_id: MAP,
      level: 'section',
      title: 'A',
      parent_id: root.id,
      sort_order: 0,
    })
    const s2 = makeNode({
      map_id: MAP,
      level: 'section',
      title: 'B',
      parent_id: root.id,
      sort_order: 1,
    })
    const b1 = makeNode({
      map_id: MAP,
      level: 'block',
      title: 'x',
      parent_id: s2.id,
      sort_order: 0,
    })
    const b2 = makeNode({
      map_id: MAP,
      level: 'block',
      title: 'y',
      parent_id: s2.id,
      sort_order: 1,
    })
    const sub = makeNode({
      map_id: MAP,
      level: 'block',
      title: 'z',
      parent_id: b2.id,
      sort_order: 0,
    })
    const n = readingNumbers([root, s1, s2, b1, b2, sub])
    expect([n[s1.id], n[s2.id], n[b1.id], n[b2.id], n[sub.id]]).toEqual([
      '1',
      '2',
      '2.1',
      '2.2',
      '2.2.1',
    ])
    expect(n[root.id]).toBeUndefined()
  })

  it('numbers a book within each chapter', () => {
    const root = makeNode({ map_id: MAP, level: 'book', title: 'Book' })
    const ch = makeNode({ map_id: MAP, level: 'chapter', title: 'Ch', parent_id: root.id })
    const s = makeNode({ map_id: MAP, level: 'section', title: 'S', parent_id: ch.id })
    const b = makeNode({ map_id: MAP, level: 'block', title: 'B', parent_id: s.id })
    expect(readingNumbers([root, ch, s, b])).toMatchObject({ [s.id]: '1', [b.id]: '1.1' })
  })
})

describe('details prompt v6 (better results, simpler maps)', () => {
  const outline = {
    sections: [
      {
        title: 'Ohm',
        summary: 'Current and voltage',
        shape: 'tree',
        paragraphs: { from: 1, to: 2 },
        subsections: [],
      },
      {
        title: 'Circuits',
        summary: 'Series and parallel',
        shape: 'tree',
        paragraphs: { from: 3, to: 4 },
        subsections: [{ title: 'Series', summary: '', paragraphs: { from: 3, to: 3 } }],
      },
    ],
  } as unknown as OutlineResponse
  const p = detailsPrompt({
    bookTitle: 'Physics',
    chapterTitle: 'Electricity',
    outline: '1. Ohm\n2. Circuits',
    otherSections: otherSectionsText(outline, 'Ohm'),
    sectionTitle: 'Ohm',
    shape: 'tree',
    sourceLanguage: 'de',
    explanationLanguage: null,
    detailLevel: 'standard',
    paragraphs: [{ n: 1, text: 'U = R · I' }],
  })

  it('tells the AI which ideas belong to other sections', () => {
    expect(otherSectionsText(outline, 'Ohm')).toBe('- Circuits: Series and parallel (Series)')
    expect(p).toContain('OTHER SECTIONS (their ideas belong there, not here)\n- Circuits')
    expect(
      otherSectionsText({ sections: [outline.sections[0]] } as OutlineResponse, 'Ohm'),
    ).toContain('only section')
  })

  it('shows a worked example in valid JSON, in the language to write in', () => {
    expect(DETAILS_PROMPT_VERSION).toBe('details.v6')
    expect(p).toContain('EXAMPLE (a different topic, in English; write yours in German)')
    const json = p.slice(p.indexOf('A good answer:\n') + 15, p.indexOf('\nNotice:'))
    const example = DetailsResponseSchema.parse(JSON.parse(json))
    expect(example.blocks).toHaveLength(4)
    expect(example.blocks[0]?.details[0]).toMatchObject({
      kind: 'formula',
      text: 'I = \\frac{V}{R}',
    })
  })

  it('asks for a simple map and a self-check', () => {
    expect(p).toContain('3 to 6 main ideas')
    expect(p).toContain('at most\n  4 sub-blocks')
    expect(p).toContain('never a block of its own')
    expect(p).toContain('summary: one line, at most 10 words')
    expect(p).toContain('SELF-CHECK before you answer')
  })
})
