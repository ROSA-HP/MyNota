import { describe, expect, it } from 'vitest'
import {
  chapterParagraphs,
  detectChapters,
  draftsFromStarts,
  isNonContent,
  mergeWithNext,
  splitAt,
  startsFromHeadings,
  startsFromOutline,
} from '@/ai/pipeline/extract/chapters'
import {
  bodySize,
  linesToParagraphs,
  runsToLines,
  stripRunningLines,
  type TextRun,
} from '@/ai/pipeline/extract/layout'
import type { Line, PageText } from '@/ai/pipeline/extract/types'

const H = 800
const run = (str: string, x: number, y: number, size = 10, rtl = false): TextRun => ({
  str,
  x,
  y,
  width: str.length * size * 0.5,
  size,
  rtl,
})

/** A body line at a given row (rows are 14pt apart from the top margin). */
const line = (text: string, row: number, opts: Partial<Line> = {}): Line => ({
  text,
  size: 10,
  top: 60 + row * 14,
  left: 50,
  width: 480,
  ...opts,
})
const page = (n: number, lines: Line[]): PageText => ({ page: n, lines, ocr: false, height: H })

describe('runsToLines', () => {
  it('groups runs into lines top to bottom and adds spaces at gaps', () => {
    const lines = runsToLines(
      [run('world', 90, 700), run('Hello', 50, 700), run('Second line', 50, 686)],
      H,
    )
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'Second line'])
    expect(lines[0]!.top).toBeCloseTo(90)
  })

  it('orders right-to-left lines from right to left', () => {
    const lines = runsToLines(
      [run('الخلية', 300, 700, 10, true), run('غشاء', 360, 700, 10, true)],
      H,
    )
    expect(lines[0]!.text).toBe('غشاء الخلية')
  })

  it('does not double spaces that pdf.js already includes', () => {
    const lines = runsToLines([run('Cell ', 50, 700), run('membrane', 75, 700)], H)
    expect(lines[0]!.text).toBe('Cell membrane')
  })
})

describe('stripRunningLines', () => {
  it('removes repeated running heads and page numbers in the margins only', () => {
    const pages = [1, 2, 3, 4].map((n) =>
      page(n, [
        line('HUMAN BIOLOGY · Chapter 2', -4, { top: 30 }),
        line(`Body text on page ${n}.`, 3),
        line(String(n + 40), 50, { top: 760 }),
      ]),
    )
    const stripped = stripRunningLines(pages)
    expect(stripped.map((p) => p.lines.map((l) => l.text))).toEqual([
      ['Body text on page 1.'],
      ['Body text on page 2.'],
      ['Body text on page 3.'],
      ['Body text on page 4.'],
    ])
  })
})

describe('linesToParagraphs', () => {
  it('splits on gaps, short sentence ends and size changes; joins hyphenated words', () => {
    const p = page(5, [
      line('2.1 Transport', 0, { size: 14 }),
      line('Passive transport moves substances down their concentra-', 2),
      line('tion gradient and needs no energy. It includes diffusion', 3),
      line('and osmosis.', 4, { width: 90 }),
      line('Active transport needs ATP.', 5, { width: 200 }),
      line('A new paragraph after a gap starts here', 8),
    ])
    expect(linesToParagraphs([p])).toEqual([
      { text: '2.1 Transport', page: 5 },
      {
        text: 'Passive transport moves substances down their concentration gradient and needs no energy. It includes diffusion and osmosis.',
        page: 5,
      },
      { text: 'Active transport needs ATP.', page: 5 },
      { text: 'A new paragraph after a gap starts here', page: 5 },
    ])
  })

  it('joins a paragraph that continues on the next page and keeps its first page', () => {
    const pages = [
      page(7, [line('The pump moves three sodium ions out and', 0)]),
      page(8, [line('two potassium ions in.', 0, { width: 150 })]),
    ]
    expect(linesToParagraphs(pages)).toEqual([
      { text: 'The pump moves three sodium ions out and two potassium ions in.', page: 7 },
    ])
  })

  it('keeps German compound hyphens before capitals', () => {
    const pages = [
      page(1, [line('Die Natrium-', 0), line('Kalium-Pumpe arbeitet.', 1, { width: 150 })]),
    ]
    expect(linesToParagraphs(pages)[0]!.text).toBe('Die Natrium-Kalium-Pumpe arbeitet.')
    const suspended = [page(1, [line('Der Ein-', 0), line('und Ausgang.', 1, { width: 90 })])]
    expect(linesToParagraphs(suspended)[0]!.text).toBe('Der Ein- und Ausgang.')
  })

  it('finds the body size by character count', () => {
    expect(
      bodySize([page(1, [line('Big title', 0, { size: 24 }), line('x'.repeat(200), 1)])]),
    ).toBe(10)
  })
})

describe('chapter detection', () => {
  it('uses bookmarks and skips a lone book-title entry', () => {
    const levels = [
      [{ title: 'Human Biology', page: 1 }],
      [
        { title: 'Contents', page: 3 },
        { title: '1 Cells', page: 7 },
        { title: '2 Membranes', page: 40 },
        { title: 'Index', page: 90 },
      ],
    ]
    const starts = startsFromOutline(levels)
    expect(starts).toHaveLength(4)
    const drafts = draftsFromStarts(starts, 95)
    expect(drafts.map((d) => [d.title, d.firstPage, d.lastPage, d.kind, d.build])).toEqual([
      ['', 1, 2, 'front', false],
      ['Contents', 3, 6, 'front', false],
      ['1 Cells', 7, 39, 'chapter', true],
      ['2 Membranes', 40, 89, 'chapter', true],
      ['Index', 90, 95, 'back', false],
    ])
  })

  it('finds chapters from large headings and "Chapter N" lines in three languages', () => {
    const body = (n: number) => line('Body text '.repeat(8), 3 + n)
    const pages = [
      page(1, [line('Chapter 1', 0, { size: 13 }), line('Cells', 1, { size: 20 }), body(0)]),
      page(2, [body(0), body(1)]),
      page(3, [
        line('Kapitel 2 Membranen', 0, { size: 13 }),
        line('Die Zelle', 1, { size: 13 }),
        body(0),
      ]),
      page(4, [line('الفصل الثالث', 0, { size: 13 }), body(0)]),
      page(5, [line('Index of terms', 0, { size: 22 }), body(0)]),
    ]
    expect(startsFromHeadings(pages)).toEqual([
      { title: 'Chapter 1: Cells', page: 1 },
      { title: 'Kapitel 2 Membranen', page: 3 },
      { title: 'الفصل الثالث', page: 4 },
      { title: 'Index of terms', page: 5 },
    ])
    const { drafts, source } = detectChapters(pages, [])
    expect(source).toBe('headings')
    expect(drafts.map((d) => d.kind)).toEqual(['chapter', 'chapter', 'chapter', 'back'])
  })

  it('falls back to one chapter for the whole file', () => {
    const { drafts, source } = detectChapters([page(1, [line('just text', 0)])], [])
    expect(source).toBe('none')
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ firstPage: 1, lastPage: 1, build: true })
  })

  it('knows non-content parts in English, German and Arabic', () => {
    for (const t of [
      'Table of Contents',
      'Inhaltsverzeichnis',
      'Stichwortverzeichnis',
      'الفهرس',
      'المراجع',
    ])
      expect(isNonContent(t)).toBe(true)
    expect(isNonContent('Cell Membranes')).toBe(false)
  })

  it('splits and merges chapters', () => {
    const drafts = draftsFromStarts(
      [
        { title: 'One', page: 1 },
        { title: 'Two', page: 20 },
      ],
      40,
    )
    const split = splitAt(drafts, 10, 'One b')
    expect(split.map((d) => [d.title, d.firstPage, d.lastPage])).toEqual([
      ['One', 1, 9],
      ['One b', 10, 19],
      ['Two', 20, 40],
    ])
    const merged = mergeWithNext(split, split[1]!.key)
    expect(merged.map((d) => [d.title, d.firstPage, d.lastPage])).toEqual([
      ['One', 1, 9],
      ['One b', 10, 40],
    ])
    expect(splitAt(drafts, 1, 'x')).toEqual(drafts) // cannot split at a chapter's first page
  })

  it('numbers a chapter’s paragraphs P1..Pn without skipped pages', () => {
    const paragraphs = [
      { text: 'a', page: 3 },
      { text: 'b', page: 4 },
      { text: 'c', page: 5 },
      { text: 'd', page: 9 },
    ]
    expect(chapterParagraphs(paragraphs, { firstPage: 3, lastPage: 6 }, new Set([4]))).toEqual([
      { n: 1, text: 'a', page: 3 },
      { n: 2, text: 'c', page: 5 },
    ])
  })
})
