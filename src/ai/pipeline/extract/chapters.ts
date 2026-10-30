import { bodySize } from './layout'
import type { ChapterDraft, ChapterSource, OutlineEntry, PageParagraph, PageText } from './types'

/** Parts of a book that are not study content; listed but unchecked by default. */
const NON_CONTENT =
  /^(table of contents|contents|preface|foreword|acknowledg|dedication|copyright|about the authors?|index|glossary|bibliography|references|further reading|answers|appendix|inhalt|inhaltsverzeichnis|vorwort|danksagung|impressum|register|stichwortverzeichnis|sachregister|literatur|literaturverzeichnis|glossar|lösungen|anhang|المحتويات|فهرس|الفهرس|المقدمة|مقدمة|تمهيد|شكر|المراجع|المصادر|ملحق|الملاحق)/i

/** Lines that open a chapter: "Chapter 3", "Kapitel 3", "الفصل الثالث", "Unit 2", "Lektion 4"… */
const CHAPTER_WORD =
  /^(chapter|unit|part|lesson|module|kapitel|teil|lektion|einheit|الفصل|الباب|الوحدة|الدرس|الجزء)(\s|$|[\d٠-٩:.])/i
const NUMBERED_TITLE = /^([\d٠-٩]{1,2})([.:)]|\s)\s*\p{L}/u

export function isNonContent(title: string): boolean {
  return NON_CONTENT.test(title.trim())
}

let seq = 0
const key = () => `ch${++seq}`

/** Builds chapter drafts from starting pages; anything before the first start is front matter. */
export function draftsFromStarts(starts: OutlineEntry[], pageCount: number): ChapterDraft[] {
  const sorted = [...starts]
    .filter((s) => s.page >= 1 && s.page <= pageCount && s.title.trim())
    .sort((a, b) => a.page - b.page)
  // One start per page (keep the first title on a page).
  const unique = sorted.filter((s, i) => i === 0 || s.page !== sorted[i - 1]?.page)
  const drafts: ChapterDraft[] = []
  const first = unique[0]
  if (!first) {
    return [
      { key: key(), title: '', firstPage: 1, lastPage: pageCount, kind: 'chapter', build: true },
    ]
  }
  if (first.page > 1)
    drafts.push({
      key: key(),
      title: '',
      firstPage: 1,
      lastPage: first.page - 1,
      kind: 'front',
      build: false,
    })
  let seenContent = false
  unique.forEach((s, i) => {
    const next = unique[i + 1]
    const nonContent = isNonContent(s.title)
    const kind: ChapterDraft['kind'] = nonContent ? (seenContent ? 'back' : 'front') : 'chapter'
    if (!nonContent) seenContent = true
    drafts.push({
      key: key(),
      title: s.title.trim().replace(/\s+/g, ' ').slice(0, 200),
      firstPage: s.page,
      lastPage: next ? next.page - 1 : pageCount,
      kind,
      build: kind === 'chapter',
    })
  })
  return drafts
}

/**
 * Chapter starts from the PDF's bookmarks. A single top entry (the book title) is skipped in
 * favour of its children, which the caller passes as the next level.
 */
export function startsFromOutline(levels: OutlineEntry[][]): OutlineEntry[] {
  for (const level of levels) {
    const real = level.filter((e) => e.title.trim())
    if (real.length >= 2) return real
  }
  return []
}

/**
 * Chapter starts from headings: at the top of a page, either a "Chapter N" style line or a much
 * larger font than the body text. "Chapter 3" on its own line takes the next line as its title.
 */
export function startsFromHeadings(pages: PageText[]): OutlineEntry[] {
  const body = bodySize(pages)
  const starts: OutlineEntry[] = []
  for (const p of pages) {
    const top = p.lines.slice(0, 4)
    for (let i = 0; i < top.length; i++) {
      const line = top[i]
      if (!line || line.text.length > 90) continue
      const big = line.size >= body * 1.6
      const word = CHAPTER_WORD.test(line.text) && line.size >= body * 1.15
      const numbered = NUMBERED_TITLE.test(line.text) && line.size >= body * 1.4
      if (!big && !word && !numbered) continue
      let title = line.text
      const nextLine = top[i + 1]
      // "Chapter 3" / "الفصل الثالث" alone on its line: the title is on the next line.
      if (word && line.text.split(/\s+/).length <= 2 && nextLine && nextLine.size >= body * 1.15)
        title = `${line.text}: ${nextLine.text}`
      starts.push({ title, page: p.page })
      break
    }
  }
  // Too many "chapters" means we caught section headings: keep only the strongest kind.
  if (starts.length > Math.max(40, pages.length / 3)) {
    return starts.filter((s) => CHAPTER_WORD.test(s.title))
  }
  return starts
}

/** Picks the best available chapter split. */
export function detectChapters(
  pages: PageText[],
  outlineLevels: OutlineEntry[][],
): { drafts: ChapterDraft[]; source: ChapterSource } {
  const pageCount = pages.length ? Math.max(...pages.map((p) => p.page)) : 1
  const fromOutline = startsFromOutline(outlineLevels)
  if (fromOutline.length >= 2)
    return { drafts: draftsFromStarts(fromOutline, pageCount), source: 'outline' }
  const fromHeadings = startsFromHeadings(pages)
  if (fromHeadings.length >= 2)
    return { drafts: draftsFromStarts(fromHeadings, pageCount), source: 'headings' }
  return { drafts: draftsFromStarts([], pageCount), source: 'none' }
}

/** Paragraphs of one chapter, minus skipped pages, numbered P1..Pn for citations. */
export function chapterParagraphs(
  paragraphs: PageParagraph[],
  draft: Pick<ChapterDraft, 'firstPage' | 'lastPage'>,
  skippedPages: ReadonlySet<number>,
): Array<{ n: number; text: string; page: number }> {
  return paragraphs
    .filter(
      (p) => p.page >= draft.firstPage && p.page <= draft.lastPage && !skippedPages.has(p.page),
    )
    .map((p, i) => ({ n: i + 1, text: p.text, page: p.page }))
}

/** Starts a new chapter at `page` inside the chapter that contains it. */
export function splitAt(drafts: ChapterDraft[], page: number, title: string): ChapterDraft[] {
  return drafts.flatMap((d) => {
    if (page <= d.firstPage || page > d.lastPage) return [d]
    return [
      { ...d, lastPage: page - 1 },
      { key: key(), title, firstPage: page, lastPage: d.lastPage, kind: 'chapter', build: true },
    ]
  })
}

/** Merges a chapter with the one after it. */
export function mergeWithNext(drafts: ChapterDraft[], chapterKey: string): ChapterDraft[] {
  const i = drafts.findIndex((d) => d.key === chapterKey)
  const a = drafts[i]
  const b = drafts[i + 1]
  if (!a || !b) return drafts
  const merged: ChapterDraft = {
    ...a,
    lastPage: b.lastPage,
    kind: a.kind === 'chapter' || b.kind === 'chapter' ? 'chapter' : a.kind,
  }
  return [...drafts.slice(0, i), merged, ...drafts.slice(i + 2)]
}
