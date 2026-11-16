import { describe, expect, it } from 'vitest'
import {
  TOC_ROW_CHAPTER,
  TOC_ROW_SECTION,
  TOC_TITLE_BLOCK,
  chapterForPage,
  pageIndexOfUnits,
  paginateFlow,
  paginateToc,
} from '@/features/export/studypdf/paginate'
import type { FlowUnit, MeasuredUnit } from '@/features/export/studypdf/types'

function makeUnit(height: number, padTop = 0, keepWithNext = 0, split = null): MeasuredUnit {
  return { height, padTop, keepWithNext, split }
}

describe('studypdf paginate', () => {
  it('places 5 units of 100 px in a 500 px body per page', () => {
    const units = [
      makeUnit(100),
      makeUnit(100),
      makeUnit(100),
      makeUnit(100),
      makeUnit(100),
      makeUnit(100),
    ]
    const pages = paginateFlow(units, 500)
    expect(pages).toHaveLength(2)
    expect(pages[0]?.placed).toHaveLength(5)
    expect(pages[1]?.placed).toHaveLength(1)
  })

  it('drops padTop at the top of a page', () => {
    // If unit height is 110, padTop is 20: effective height at top is 90
    const units = [makeUnit(110, 20)]
    const pages = paginateFlow(units, 100)
    expect(pages).toHaveLength(1)
    expect(pages[0]?.placed).toHaveLength(1)
  })

  it('moves a chapter (keepWithNext 2) at the end of a page together with its section and block', () => {
    // Body height 500.
    // Unit 0: 400px (fills most of page 1)
    // Unit 1: chapter 50px, keepWithNext 2
    // Unit 2: section 40px
    // Unit 3: block 40px
    // If not kept together, unit 1 would fit on page 1 (400 + 50 <= 500), but 400 + 50 + 40 + 40 = 530 > 500.
    // So unit 1, 2, 3 must move to page 2!
    const units = [makeUnit(400), makeUnit(50, 0, 2), makeUnit(40), makeUnit(40)]
    const pages = paginateFlow(units, 500)
    expect(pages).toHaveLength(2)
    expect(pages[0]?.placed.map((p) => p.unitIndex)).toEqual([0])
    expect(pages[1]?.placed.map((p) => p.unitIndex)).toEqual([1, 2, 3])
  })

  it('ignores the group rule when the group is taller than the body', () => {
    // Group total is 600px > bodyHeight 500px.
    // Unit 0 is 300px with keepWithNext 1, Unit 1 is 300px.
    // On page 1: unit 0 starts, end reduced to 0, placed on page 1.
    // Unit 1 placed on page 2.
    const units = [makeUnit(300, 0, 1), makeUnit(300)]
    const pages = paginateFlow(units, 500)
    expect(pages).toHaveLength(2)
    expect(pages[0]?.placed.map((p) => p.unitIndex)).toEqual([0])
    expect(pages[1]?.placed.map((p) => p.unitIndex)).toEqual([1])
  })

  it('ensures every unit appears exactly once in order, with no page over bodyHeight', () => {
    const units = [
      makeUnit(150, 10, 1),
      makeUnit(200, 10),
      makeUnit(180, 10),
      makeUnit(220, 10),
      makeUnit(100, 10),
    ]
    const pages = paginateFlow(units, 400)
    const allPlaced = pages.flatMap((p) => p.placed)
    expect(allPlaced.map((p) => p.unitIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('splits a tall block across pages', () => {
    // split rows [100, 100, 100, 100], head 40, base 30, gap 4 and bodyHeight 300
    // partHeight(from=0, to=1): 30 + 40 + 100 + 0 = 170 <= 300
    // partHeight(from=0, to=2): 30 + 40 + 200 + 4 = 274 <= 300
    // partHeight(from=0, to=3): 30 + 40 + 300 + 8 = 378 > 300
    // Part 1: rows 0..2 (height 274 <= 300, continued false)
    // Part 2: rows 2..4 (height 274 <= 300, continued true)
    const splitInfo = {
      head: 40,
      rows: [100, 100, 100, 100],
      base: 30,
      gap: 4,
    }
    const units: MeasuredUnit[] = [
      {
        height: 482,
        padTop: 0,
        keepWithNext: 0,
        split: splitInfo,
      },
    ]

    const pages = paginateFlow(units, 300)
    expect(pages).toHaveLength(2)

    const part1 = pages[0]?.placed[0]
    const part2 = pages[1]?.placed[0]

    expect(part1?.unitIndex).toBe(0)
    expect(part1?.rowFrom).toBe(0)
    expect(part1?.rowTo).toBe(2)
    expect(part1?.continued).toBe(false)

    expect(part2?.unitIndex).toBe(0)
    expect(part2?.rowFrom).toBe(2)
    expect(part2?.rowTo).toBe(4)
    expect(part2?.continued).toBe(true)
  })

  it('places a unit without split that is taller than the body once', () => {
    const units = [makeUnit(600)]
    const pages = paginateFlow(units, 500)
    expect(pages).toHaveLength(1)
    expect(pages[0]?.placed).toHaveLength(1)
    expect(pages[0]?.placed[0]?.unitIndex).toBe(0)
  })

  it('paginates TOC correctly for 100 mixed rows', () => {
    const levels: Array<'chapter' | 'section'> = []
    for (let i = 0; i < 100; i++) {
      levels.push(i % 5 === 0 ? 'chapter' : 'section')
    }

    const bodyHeight = 500
    const capacity = bodyHeight - TOC_TITLE_BLOCK
    const pages = paginateToc(levels, bodyHeight)

    expect(pages.length).toBeGreaterThan(1)

    // Check each page height stays inside capacity
    for (const page of pages) {
      const pageHeight = page.reduce(
        (acc, idx) => acc + (levels[idx] === 'chapter' ? TOC_ROW_CHAPTER : TOC_ROW_SECTION),
        0,
      )
      expect(pageHeight).toBeLessThanOrEqual(capacity)
    }

    // Check joined indexes join to 0..99
    const joined = pages.flat()
    expect(joined).toHaveLength(100)
    expect(joined).toEqual(Array.from({ length: 100 }, (_, i) => i))
  })

  it('computes pageIndexOfUnits and chapterForPage accurately', () => {
    const pages = [
      {
        placed: [
          { unitIndex: 0, rowFrom: 0, rowTo: 0, continued: false },
          { unitIndex: 1, rowFrom: 0, rowTo: 0, continued: false },
          { unitIndex: 2, rowFrom: 0, rowTo: 2, continued: false },
        ],
      },
      {
        placed: [
          { unitIndex: 2, rowFrom: 2, rowTo: 4, continued: true },
          { unitIndex: 3, rowFrom: 0, rowTo: 0, continued: false },
        ],
      },
    ]

    const pageIndices = pageIndexOfUnits(pages, 4)
    expect(pageIndices).toEqual([0, 0, 0, 1])

    const flowUnits: FlowUnit[] = [
      {
        kind: 'chapter',
        id: 'c1',
        number: 1,
        title: 'Ch 1',
        summary: '',
        color: 'yellow',
        dir: 'ltr',
      },
      {
        kind: 'section',
        id: 's1',
        label: '1.1',
        title: 'Sec 1.1',
        summary: '',
        color: 'yellow',
        dir: 'ltr',
      },
      {
        kind: 'block',
        id: 'b1',
        relDepth: 0,
        title: 'Block 1',
        type: null,
        importance: 'core',
        color: 'yellow',
        dir: 'ltr',
        aiAdded: false,
        rows: [],
      },
      {
        kind: 'block',
        id: 'b2',
        relDepth: 0,
        title: 'Block 2',
        type: null,
        importance: 'core',
        color: 'yellow',
        dir: 'ltr',
        aiAdded: false,
        rows: [],
      },
    ]

    expect(chapterForPage(pages[0]!, flowUnits)?.id).toBe('c1')
    expect(chapterForPage(pages[1]!, flowUnits)?.id).toBe('c1')
  })
})
