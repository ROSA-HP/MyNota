// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { detectChapters } from '@/ai/pipeline/extract/chapters'
import { linesToParagraphs, stripRunningLines } from '@/ai/pipeline/extract/layout'
import { hasImages, looksScanned, readOutline, readPageText } from '@/ai/pipeline/extract/pdf'

/**
 * Runs the real pdf.js text extraction on a small generated book (tests/fixtures/book.pdf:
 * title page, contents, English, German and Arabic chapters, index, with bookmarks).
 */
describe('PDF extraction (pdf.js)', async () => {
  const data = new Uint8Array(readFileSync('tests/fixtures/book.pdf'))
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false, disableFontFace: true })
    .promise
  const pages: Awaited<ReturnType<typeof readPageText>>[] = []
  for (let n = 1; n <= doc.numPages; n++) pages.push(await readPageText(doc as never, n))
  const outline = await readOutline(doc as never)
  const cleaned = stripRunningLines(pages)
  const paragraphs = linesToParagraphs(cleaned)

  it('reads text on every page; short pages are not scans', async () => {
    expect(pages.length).toBeGreaterThanOrEqual(6)
    const short = pages.filter(looksScanned).map((p) => p.page)
    for (const n of short) expect(await hasImages(doc as never, n)).toBe(false)
  })

  it('splits chapters from the bookmarks and skips contents and index', () => {
    const { drafts, source } = detectChapters(cleaned, outline)
    expect(source).toBe('outline')
    const chapters = drafts.filter((d) => d.kind === 'chapter').map((d) => d.title)
    expect(chapters.slice(0, 2)).toEqual(['1 Cells', '2 Membranen'])
    // Chromium writes RTL bookmark titles in visual word order; the words are what matter.
    expect(chapters[2]).toMatch(/الخلايا/)
    expect(chapters[2]).toMatch(/العصبية/)
    expect(drafts.filter((d) => !d.build).map((d) => d.title)).toEqual(
      expect.arrayContaining(['Contents', 'Index']),
    )
  })

  it('builds whole paragraphs, keeps German compounds and Arabic text in order', () => {
    const text = paragraphs.map((p) => p.text)
    expect(text).toContain('1.1 Cell theory')
    expect(text.some((t) => t.startsWith('Mitochondria release energy') && t.length > 400)).toBe(
      true,
    )
    expect(text.join(' ')).toContain('Natrium-Kalium-Pumpe')
    expect(text.join(' ')).toContain('تنقل الخلايا العصبية الإشارات')
  })
})
