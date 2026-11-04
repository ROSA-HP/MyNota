import type { PDFDocumentProxy } from 'pdfjs-dist'
import { runsToLines, type TextRun } from './layout'
import type { OutlineEntry, PageText } from './types'

/**
 * Reading text from an open PDF. Kept apart from pdf.ts (which loads pdf.js the Vite way) so the
 * admin MCP server can read PDFs in Node with exactly the same rules as the browser.
 */

interface PdfTextItem {
  str: string
  dir: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

/** Text lines of one page, or empty lines when the page is a scan without a text layer. */
export async function readPageText(doc: PDFDocumentProxy, n: number): Promise<PageText> {
  const page = await doc.getPage(n)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const runs: TextRun[] = []
  for (const it of content.items as Array<PdfTextItem | { type: string }>) {
    if (!('str' in it)) continue
    const [, , c = 0, d = 0, e = 0, f = 0] = it.transform
    runs.push({
      str: it.str,
      x: e,
      y: f,
      width: it.width,
      size: Math.hypot(c, d) || it.height || 10,
      rtl: it.dir === 'rtl',
      eol: it.hasEOL,
    })
  }
  page.cleanup()
  return { page: n, lines: runsToLines(runs, viewport.height), ocr: false, height: viewport.height }
}

/** Almost no extractable text on a page: a scan, or just a short page (title, blank). */
export function looksScanned(p: PageText): boolean {
  return p.lines.reduce((s, l) => s + l.text.replace(/\s/g, '').length, 0) < 25
}

interface RawOutlineItem {
  title: string
  dest: string | unknown[] | null
  items: RawOutlineItem[]
}

/** Bookmarks as levels: [top level, children of the top level]. Each entry has its page. */
export async function readOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[][]> {
  const raw = (await doc.getOutline()) as RawOutlineItem[] | null
  if (!raw?.length) return []
  const pageOf = async (item: RawOutlineItem): Promise<number | null> => {
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
      const ref = Array.isArray(dest) ? dest[0] : null
      if (ref == null) return null
      if (typeof ref === 'number') return ref + 1
      return (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1
    } catch {
      return null
    }
  }
  const level = async (items: RawOutlineItem[]): Promise<OutlineEntry[]> => {
    const out: OutlineEntry[] = []
    for (const it of items) {
      const page = await pageOf(it)
      if (page) out.push({ title: it.title.normalize('NFKC'), page })
    }
    return out
  }
  const top = await level(raw)
  const children = await level(
    raw.length === 1 ? (raw[0]?.items ?? []) : raw.flatMap((r) => r.items),
  )
  return [top, children]
}
