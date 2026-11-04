import type { PDFDocumentProxy } from 'pdfjs-dist'
import { detectChapters } from './chapters'
import { linesToParagraphs, stripRunningLines } from './layout'
import { ocrImage, photoToCanvas, type OcrLanguage } from './ocr'
import { hasImages, looksScanned, openPdf, readOutline, readPageText, renderPage } from './pdf'
import { MAX_FILE_BYTES, MAX_PAGES, MAX_PHOTO_BYTES, PHOTO_TYPES } from './limits'
import type { ChapterDraft, ChapterSource, PageParagraph, PageText } from './types'

export { MAX_FILE_BYTES, MAX_PAGES, MAX_PHOTO_BYTES, PHOTO_TYPES }

export class ExtractError extends Error {
  constructor(
    readonly kind: 'too_big' | 'too_many_pages' | 'bad_type' | 'unreadable' | 'encrypted' | 'empty',
    message = kind,
  ) {
    super(message)
    this.name = 'ExtractError'
  }
}

export interface ExtractProgress {
  /** Pages read from the text layer so far. */
  read: number
  total: number
  /** Scanned pages found / read with OCR so far. */
  ocrTotal: number
  ocrDone: number
}

export interface Extracted {
  kind: 'pdf' | 'images'
  pageCount: number
  pages: PageText[]
  paragraphs: PageParagraph[]
  chapters: ChapterDraft[]
  chapterSource: ChapterSource
  ocrPages: number[]
  /** The open PDF, kept for page thumbnails on the review screen. */
  doc?: PDFDocumentProxy
}

interface Options {
  ocrLanguage: OcrLanguage
  onProgress?: (p: ExtractProgress) => void
  signal?: AbortSignal
}

const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function finish(
  kind: Extracted['kind'],
  pages: PageText[],
  outline: Parameters<typeof detectChapters>[1],
) {
  const cleaned = stripRunningLines(pages)
  const paragraphs = linesToParagraphs(cleaned)
  if (!paragraphs.length) throw new ExtractError('empty')
  const { drafts, source } = detectChapters(cleaned, outline)
  return {
    kind,
    pageCount: pages.length,
    pages: cleaned,
    paragraphs,
    chapters: drafts,
    chapterSource: source,
    ocrPages: pages.filter((p) => p.ocr).map((p) => p.page),
  }
}

/**
 * Reads a PDF in the browser: the text layer of every page, OCR for pages without one, then
 * paragraphs (running heads removed) and chapter suggestions. Nothing leaves the device.
 */
export async function extractPdf(file: File, opts: Options): Promise<Extracted> {
  if (file.size > MAX_FILE_BYTES) throw new ExtractError('too_big')
  if (file.type && file.type !== 'application/pdf') throw new ExtractError('bad_type')
  let doc: PDFDocumentProxy
  try {
    doc = await openPdf(await file.arrayBuffer())
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    throw new ExtractError(name === 'PasswordException' ? 'encrypted' : 'unreadable')
  }
  if (doc.numPages > MAX_PAGES) {
    void doc.loadingTask.destroy()
    throw new ExtractError('too_many_pages')
  }
  const total = doc.numPages
  const progress: ExtractProgress = { read: 0, total, ocrTotal: 0, ocrDone: 0 }
  const pages: PageText[] = []
  const scanned: number[] = []
  for (let n = 1; n <= total; n++) {
    check(opts.signal)
    const p = await readPageText(doc, n)
    if (looksScanned(p) && (await hasImages(doc, n))) scanned.push(n)
    pages.push(p)
    progress.read = n
    progress.ocrTotal = scanned.length
    opts.onProgress?.({ ...progress })
  }
  for (const n of scanned) {
    check(opts.signal)
    const scale = 2
    const canvas = await renderPage(doc, n, { scale })
    const { lines, height } = await ocrImage(canvas, opts.ocrLanguage)
    canvas.width = canvas.height = 0 // free memory now
    // OCR measures in pixels of the rendered page; convert back to PDF points so scanned and
    // text pages compare (heading sizes, margins).
    pages[n - 1] = {
      page: n,
      lines: lines.map((l) => ({
        ...l,
        size: l.size / scale,
        top: l.top / scale,
        left: l.left / scale,
        width: l.width / scale,
      })),
      ocr: true,
      height: height / scale,
    }
    progress.ocrDone += 1
    opts.onProgress?.({ ...progress })
  }
  const outline = await readOutline(doc).catch(() => [])
  return { ...finish('pdf', pages, outline), doc }
}

/** Reads photos of pages (in the given order) with OCR; each photo is one page. */
export async function extractImages(files: File[], opts: Options): Promise<Extracted> {
  if (files.length > MAX_PAGES) throw new ExtractError('too_many_pages')
  for (const f of files) {
    if (!PHOTO_TYPES.includes(f.type)) throw new ExtractError('bad_type')
    if (f.size > MAX_PHOTO_BYTES) throw new ExtractError('too_big')
  }
  const progress: ExtractProgress = {
    read: 0,
    total: files.length,
    ocrTotal: files.length,
    ocrDone: 0,
  }
  const pages: PageText[] = []
  for (const [i, f] of files.entries()) {
    check(opts.signal)
    const canvas = await photoToCanvas(f)
    const { lines, height } = await ocrImage(canvas, opts.ocrLanguage)
    canvas.width = canvas.height = 0
    pages.push({ page: i + 1, lines, ocr: true, height })
    progress.read = progress.ocrDone = i + 1
    opts.onProgress?.({ ...progress })
  }
  return finish('images', pages, [])
}

/** SHA-256 of a file, hex. Used to find the device copy of a book again. */
export async function fileHash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export { renderPage }
export type { ChapterDraft, PageParagraph } from './types'
