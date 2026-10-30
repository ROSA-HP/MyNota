import type { PDFDocumentProxy } from 'pdfjs-dist'
import { runsToLines, type TextRun } from './layout'
import type { OutlineEntry, PageText } from './types'

const BASE = import.meta.env.BASE_URL

/** pdf.js is loaded on demand (it is large) with its worker and data files from our origin. */
async function pdfjs() {
  const [lib, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await pdfjs()
  return lib.getDocument({
    data,
    cMapUrl: `${BASE}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
    wasmUrl: `${BASE}pdfjs/wasm/`,
    iccUrl: `${BASE}pdfjs/iccs/`,
    enableXfa: false,
  }).promise
}

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

/** Whether a page paints an image (a scanned page is one big image). */
export async function hasImages(doc: PDFDocumentProxy, n: number): Promise<boolean> {
  const lib = await pdfjs()
  const page = await doc.getPage(n)
  const ops = await page.getOperatorList()
  const imageOps = new Set([
    lib.OPS.paintImageXObject,
    lib.OPS.paintInlineImageXObject,
    lib.OPS.paintImageXObjectRepeat,
  ])
  page.cleanup()
  return ops.fnArray.some((op) => imageOps.has(op))
}

/** Renders a page to a canvas (for OCR at scale ~2, for thumbnails at a small width). */
export async function renderPage(
  doc: PDFDocumentProxy,
  n: number,
  opts: { scale?: number; width?: number },
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const scale = opts.width ? opts.width / base.width : (opts.scale ?? 2)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  page.cleanup()
  return canvas
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
