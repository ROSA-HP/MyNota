import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join } from 'node:path'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { SourceParagraph } from '@/lib/database.types'
import { chapterParagraphs, detectChapters } from '../src/ai/pipeline/extract/chapters'
import { linesToParagraphs, stripRunningLines } from '../src/ai/pipeline/extract/layout'
import { MAX_FILE_BYTES, MAX_PAGES } from '../src/ai/pipeline/extract/limits'
import { looksScanned, readOutline, readPageText } from '../src/ai/pipeline/extract/pdfText'
import type { ChapterDraft, PageText } from '../src/ai/pipeline/extract/types'
import { detectLanguage, splitParagraphs } from '../src/ai/pipeline/prepare'

/**
 * Reads a file into numbered paragraphs, with the same code the browser uses, so the model never
 * has to retype a book (slow, costly, and a chance to change the words).
 *
 * Only study files: the AI chooses this path, and a page it has read could try to steer it, so
 * this must not become a way to read other files on the computer.
 */
const TEXT_FILES = new Set(['.txt', '.md'])
/** About what one `sources` row may hold (its limit is 2 MB of JSON). */
const MAX_TEXT_CHARS = 1_500_000

export interface SourceChapter {
  title: string
  kind: ChapterDraft['kind']
  firstPage: number | null
  lastPage: number | null
  paragraphs: SourceParagraph[]
}

export interface LoadedSource {
  kind: 'pdf' | 'text'
  title: string
  language: 'en' | 'ar' | 'de' | null
  file: { name: string; size: number; hash: string } | null
  pageCount: number | null
  /** Pages with no text layer (a scan): not in the draft, because OCR runs only in the app. */
  pagesWithoutText: number[]
  chapters: SourceChapter[]
}

export class SourceError extends Error {}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const nameOf = (path: string) => basename(path, extname(path))

function fromText(text: string, title: string, file: LoadedSource['file']): LoadedSource {
  if (text.length > MAX_TEXT_CHARS) {
    throw new SourceError(`This text is too long (the limit is ${MAX_TEXT_CHARS} characters).`)
  }
  const paragraphs = splitParagraphs(text)
  if (!paragraphs.length) throw new SourceError('There is no text to map.')
  return {
    kind: 'text',
    title,
    language: detectLanguage(text).lang,
    file,
    pageCount: null,
    pagesWithoutText: [],
    chapters: [{ title, kind: 'chapter', firstPage: null, lastPage: null, paragraphs }],
  }
}

async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const base = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  try {
    return await getDocument({
      data: bytes,
      cMapUrl: `${join(base, 'cmaps')}/`,
      cMapPacked: true,
      standardFontDataUrl: `${join(base, 'standard_fonts')}/`,
      wasmUrl: `${join(base, 'wasm')}/`,
      iccUrl: `${join(base, 'iccs')}/`,
      enableXfa: false,
      verbosity: 0,
    }).promise
  } catch (e) {
    throw new SourceError(
      e instanceof Error && e.name === 'PasswordException'
        ? 'This PDF is protected by a password.'
        : 'This PDF could not be read.',
    )
  }
}

async function fromPdf(bytes: Uint8Array, name: string, title: string): Promise<LoadedSource> {
  const doc = await openPdf(bytes)
  try {
    if (doc.numPages > MAX_PAGES) {
      throw new SourceError(`This PDF has ${doc.numPages} pages; the limit is ${MAX_PAGES}.`)
    }
    const pages: PageText[] = []
    for (let n = 1; n <= doc.numPages; n++) pages.push(await readPageText(doc, n))
    const outline = await readOutline(doc).catch(() => [])
    const cleaned = stripRunningLines(pages)
    const paragraphs = linesToParagraphs(cleaned)
    const pagesWithoutText = pages.filter(looksScanned).map((p) => p.page)
    if (!paragraphs.length) {
      throw new SourceError(
        'This PDF has no text layer (it is a scan). Scanned files are read with OCR in the app, not here.',
      )
    }
    const none = new Set<number>()
    const chapters = detectChapters(cleaned, outline)
      .drafts.map((d) => ({
        title: d.title.trim(),
        kind: d.kind,
        firstPage: d.firstPage,
        lastPage: d.lastPage,
        paragraphs: chapterParagraphs(paragraphs, d, none),
      }))
      .filter((c) => c.paragraphs.length > 0)
    return {
      kind: 'pdf',
      title,
      language: detectLanguage(paragraphs.map((p) => p.text).join('\n')).lang,
      file: { name: name.slice(0, 255), size: bytes.byteLength, hash: sha256(bytes) },
      pageCount: doc.numPages,
      pagesWithoutText,
      chapters,
    }
  } finally {
    void doc.loadingTask.destroy()
  }
}

export async function readSource(input: {
  path?: string | undefined
  text?: string | undefined
  title?: string | undefined
}): Promise<LoadedSource> {
  if (input.text !== undefined) {
    return fromText(input.text, input.title?.trim() || 'Notes', null)
  }
  const path = input.path
  if (!path) throw new SourceError('Give a file path or the text itself.')
  const ext = extname(path).toLowerCase()
  if (ext !== '.pdf' && !TEXT_FILES.has(ext)) {
    throw new SourceError('Only .pdf, .txt and .md files can be mapped.')
  }
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new SourceError(`There is no file at ${path}.`)
  if (info.size > MAX_FILE_BYTES) {
    throw new SourceError(`This file is too big; the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }
  const bytes = new Uint8Array(await readFile(path))
  const title = input.title?.trim() || nameOf(path)
  if (ext === '.pdf') return fromPdf(bytes, basename(path), title)
  return fromText(new TextDecoder('utf-8').decode(bytes), title, null)
}
