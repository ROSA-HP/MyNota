import { describe, expect, it } from 'vitest'
import type { OutlineItem } from '@/features/export/outline'
import { arrowFor, buildStudyDoc, clip, splitCloze } from '@/features/export/studypdf/model'
import type { BlockUnit, ChapterUnit, SectionUnit } from '@/features/export/studypdf/types'

function makeItem(
  id: string,
  depth: number,
  level: OutlineItem['level'],
  extra: Partial<OutlineItem> = {},
): OutlineItem {
  return {
    id,
    depth,
    level,
    title: id,
    summary: '',
    details: [],
    links: [],
    cards: [],
    type: null,
    importance: 'supporting',
    color: 'yellow',
    dir: 'ltr',
    aiAdded: false,
    page: null,
    detailBlocks: [],
    ...extra,
  }
}

describe('studypdf model', () => {
  it('clips text properly, keeping multi-byte emoji characters intact', () => {
    expect(clip('Hello World', 5)).toBe('Hell…')
    expect(clip('Hello', 5)).toBe('Hello')
    expect(clip('🚀🌟✨🎉🎈', 4)).toBe('🚀🌟✨…')
  })

  it('splits cloze text into plain and gap segments', () => {
    const segments = splitCloze('Moves {{water::hint}} fast')
    expect(segments).toEqual([
      { text: 'Moves ', gap: false },
      { text: 'water', gap: true },
      { text: ' fast', gap: false },
    ])

    const startEnd = splitCloze('{{first}} and {{second}}')
    expect(startEnd).toEqual([
      { text: 'first', gap: true },
      { text: ' and ', gap: false },
      { text: 'second', gap: true },
    ])
  })

  it('computes arrows correctly for ltr and rtl', () => {
    expect(arrowFor(true, 'ltr')).toBe('→')
    expect(arrowFor(false, 'ltr')).toBe('←')
    expect(arrowFor(true, 'rtl')).toBe('←')
    expect(arrowFor(false, 'rtl')).toBe('→')
  })

  it('handles a book with 2 chapters, each with 2 sections', () => {
    const items: OutlineItem[] = [
      makeItem('Book', 0, 'book'),
      makeItem('Ch1', 1, 'chapter'),
      makeItem('Sec1_1', 2, 'section'),
      makeItem('Sec1_2', 2, 'section'),
      makeItem('Ch2', 1, 'chapter'),
      makeItem('Sec2_1', 2, 'section'),
      makeItem('Sec2_2', 2, 'section'),
    ]

    const doc = buildStudyDoc({
      title: 'My Book',
      kind: 'book',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: true, cards: true, sources: true, aiTags: true },
    })

    expect(doc.flow).toHaveLength(6)
    const ch1 = doc.flow[0] as ChapterUnit | undefined
    const sec1_1 = doc.flow[1] as SectionUnit | undefined
    const sec1_2 = doc.flow[2] as SectionUnit | undefined
    const ch2 = doc.flow[3] as ChapterUnit | undefined
    const sec2_1 = doc.flow[4] as SectionUnit | undefined
    const sec2_2 = doc.flow[5] as SectionUnit | undefined

    expect(ch1?.kind).toBe('chapter')
    expect(ch1?.number).toBe(1)
    expect(sec1_1?.kind).toBe('section')
    expect(sec1_1?.label).toBe('1.1')
    expect(sec1_2?.kind).toBe('section')
    expect(sec1_2?.label).toBe('1.2')

    expect(ch2?.kind).toBe('chapter')
    expect(ch2?.number).toBe(2)
    expect(sec2_1?.kind).toBe('section')
    expect(sec2_1?.label).toBe('2.1')
    expect(sec2_2?.kind).toBe('section')
    expect(sec2_2?.label).toBe('2.2')

    expect(doc.toc).toHaveLength(6)
    expect(doc.toc.map((t) => [t.unitIndex, t.label])).toEqual([
      [0, '1'],
      [1, '1.1'],
      [2, '1.2'],
      [3, '2'],
      [4, '2.1'],
      [5, '2.2'],
    ])
  })

  it('handles a notes map with root level book and sections directly under it', () => {
    const items: OutlineItem[] = [
      makeItem('Notes', 0, 'book'),
      makeItem('Sec1', 1, 'section'),
      makeItem('Sec2', 1, 'section'),
      makeItem('Sec3', 1, 'section'),
    ]

    const doc = buildStudyDoc({
      title: 'My Notes',
      kind: 'notes',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: true, cards: true, sources: true, aiTags: true },
    })

    const chapters = doc.flow.filter((u) => u.kind === 'chapter')
    expect(chapters).toHaveLength(0)

    const sections = doc.flow.filter((u) => u.kind === 'section') as SectionUnit[]
    expect(sections.map((s) => s.label)).toEqual(['1', '2', '3'])
  })

  it('clamps block nesting depths 1, 2, 3, 4, 5 below a section to relDepth 0, 1, 2, 3, 3', () => {
    const items: OutlineItem[] = [
      makeItem('Book', 0, 'book'),
      makeItem('Sec', 1, 'section'),
      makeItem('B1', 2, 'block'),
      makeItem('B2', 3, 'block'),
      makeItem('B3', 4, 'block'),
      makeItem('B4', 5, 'block'),
      makeItem('B5', 6, 'block'),
    ]

    const doc = buildStudyDoc({
      title: 'Depths',
      kind: 'notes',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: true, cards: true, sources: true, aiTags: true },
    })

    const blocks = doc.flow.filter((u): u is BlockUnit => u.kind === 'block')
    expect(blocks.map((b) => b.relDepth)).toEqual([0, 1, 2, 3, 3])
  })

  it('places rows in order summary, details, links, source, cardsHead, cards; omits links when false', () => {
    const items: OutlineItem[] = [
      makeItem('Sec', 0, 'section'),
      makeItem('Block', 1, 'block', {
        summary: 'A nice summary',
        detailBlocks: [{ kind: 'text', text: 'Detail 1' }],
        links: [{ label: 'links to', other: 'Other', outgoing: true }],
        page: 42,
        cards: [{ front: 'Q1', back: 'A1' }],
      }),
    ]

    const docWithLinks = buildStudyDoc({
      title: 'Rows',
      kind: 'notes',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: true, cards: true, sources: true, aiTags: true },
    })

    const block1 = docWithLinks.flow.find((u): u is BlockUnit => u.kind === 'block')!
    expect(block1.rows.map((r) => r.kind)).toEqual([
      'summary',
      'detail',
      'link',
      'source',
      'cardsHead',
      'card',
    ])

    const docNoLinks = buildStudyDoc({
      title: 'No Links',
      kind: 'notes',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: false, cards: true, sources: true, aiTags: true },
    })

    const block2 = docNoLinks.flow.find((u): u is BlockUnit => u.kind === 'block')!
    expect(block2.rows.map((r) => r.kind)).toEqual([
      'summary',
      'detail',
      'source',
      'cardsHead',
      'card',
    ])
  })

  it('correctly handles summary preset pruning and filtering', () => {
    const items: OutlineItem[] = [
      makeItem('Book', 0, 'book'),
      makeItem('Ch1', 1, 'chapter'),
      makeItem('Sec1_1', 2, 'section'),
      makeItem('B_sup', 3, 'block', {
        importance: 'supporting',
        detailBlocks: [
          { kind: 'text', text: 'ignore me' },
          { kind: 'formula', latex: 'a^2+b^2=c^2' },
        ],
        links: [{ label: 'rel', other: 'X', outgoing: true }],
        cards: [{ front: 'q', back: 'a' }],
      }),
      makeItem('B_core', 4, 'block', { importance: 'core' }),
      makeItem('Sec1_2', 2, 'section'),
      makeItem('B_sup_only', 3, 'block', { importance: 'supporting' }),
      makeItem('Ch2', 1, 'chapter'),
      makeItem('Sec2_1', 2, 'section'),
      makeItem('B_sup_alone', 3, 'block', { importance: 'supporting' }),
    ]

    const doc = buildStudyDoc({
      title: 'Summary Doc',
      kind: 'book',
      preset: 'summary',
      dir: 'ltr',
      items,
      include: { links: true, cards: true, sources: true, aiTags: true },
    })

    // Ch2 dropped, Sec1_2 dropped. Remaining: Ch1, Sec1_1, B_sup, B_core
    expect(doc.flow.map((u) => u.id)).toEqual(['Ch1', 'Sec1_1', 'B_sup', 'B_core'])

    const ch1 = doc.flow[0] as ChapterUnit | undefined
    expect(ch1?.kind).toBe('chapter')
    expect(ch1?.number).toBe(1)

    const sec1_1 = doc.flow[1] as SectionUnit | undefined
    expect(sec1_1?.kind).toBe('section')
    expect(sec1_1?.label).toBe('1.1')

    const bSup = doc.flow[2] as BlockUnit | undefined
    expect(bSup?.kind).toBe('block')
    if (bSup && bSup.kind === 'block') {
      expect(bSup.rows).toHaveLength(1)
      const firstRow = bSup.rows[0]
      expect(firstRow?.kind).toBe('detail')
      if (firstRow && firstRow.kind === 'detail') {
        expect(firstRow.detail.kind).toBe('formula')
      }
    }
  })

  it('handles cards preset: empty flow, tiles numbered 1..n, stats from items', () => {
    const items: OutlineItem[] = [
      makeItem('Ch', 0, 'chapter', { color: 'sky', dir: 'rtl' }),
      makeItem('B1', 1, 'block', {
        title: 'Block 1',
        color: 'sky',
        dir: 'rtl',
        cards: [
          { front: 'F1', back: 'B1' },
          { front: 'F2', back: 'B2' },
        ],
        detailBlocks: [{ kind: 'formula', latex: 'x=1' }],
      }),
      makeItem('B2', 1, 'block', {
        title: 'Block 2',
        color: 'coral',
        dir: 'ltr',
        cards: [{ front: 'F3', back: 'B3' }],
      }),
    ]

    const doc = buildStudyDoc({
      title: 'Flashcards',
      kind: 'book',
      preset: 'cards',
      dir: 'ltr',
      items,
      include: { links: true, cards: true, sources: true, aiTags: true },
    })

    expect(doc.flow).toHaveLength(0)
    expect(doc.tiles).toHaveLength(3)
    expect(doc.tiles[0]).toEqual({
      n: 1,
      front: 'F1',
      back: 'B1',
      title: 'Block 1',
      color: 'sky',
      dir: 'rtl',
    })
    expect(doc.tiles[1]).toEqual({
      n: 2,
      front: 'F2',
      back: 'B2',
      title: 'Block 1',
      color: 'sky',
      dir: 'rtl',
    })
    expect(doc.tiles[2]).toEqual({
      n: 3,
      front: 'F3',
      back: 'B3',
      title: 'Block 2',
      color: 'coral',
      dir: 'ltr',
    })

    expect(doc.stats).toEqual({
      chapters: 1,
      sections: 0,
      blocks: 2,
      formulas: 1,
      cards: 3,
    })
  })

  it('computes stats for preset notes properly', () => {
    const items: OutlineItem[] = [
      makeItem('Ch', 0, 'chapter'),
      makeItem('Sec', 1, 'section'),
      makeItem('B', 2, 'block', {
        detailBlocks: [
          { kind: 'formula', latex: '1' },
          { kind: 'formula', latex: '2' },
          { kind: 'text', text: 'txt' },
        ],
        cards: [{ front: 'q', back: 'a' }],
      }),
    ]

    const doc = buildStudyDoc({
      title: 'Stats Doc',
      kind: 'book',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: true, cards: true, sources: true, aiTags: true },
    })

    expect(doc.stats).toEqual({
      chapters: 1,
      sections: 1,
      blocks: 1,
      formulas: 2,
      cards: 1,
    })
  })
})
