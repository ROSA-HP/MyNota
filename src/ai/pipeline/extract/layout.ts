import type { Line, PageParagraph, PageText } from './types'

/** A positioned run of text as pdf.js reports it (y measured from the page bottom). */
export interface TextRun {
  str: string
  x: number
  y: number
  width: number
  size: number
  rtl: boolean
  /** pdf.js marks the end of a visual line. */
  eol?: boolean
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2
}

/** Groups text runs into lines (top to bottom), ordering each line by its writing direction. */
export function runsToLines(runs: TextRun[], pageHeight: number): Line[] {
  const items = runs.filter((r) => r.str.trim() || r.str === ' ')
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: TextRun[][] = []
  for (const r of sorted) {
    const row = rows[rows.length - 1]
    const ref = row?.[0]
    if (row && ref && Math.abs(ref.y - r.y) <= Math.max(ref.size, r.size) * 0.5) row.push(r)
    else rows.push([r])
  }
  const lines: Line[] = []
  for (const row of rows) {
    const rtl = row.filter((r) => r.rtl).length > row.length / 2
    row.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
    let text = ''
    let prev: TextRun | null = null
    for (const r of row) {
      if (prev) {
        const gap = rtl ? prev.x - (r.x + r.width) : r.x - (prev.x + prev.width)
        const needsSpace =
          gap > Math.min(prev.size, r.size) * 0.12 && !text.endsWith(' ') && !r.str.startsWith(' ')
        if (needsSpace) text += ' '
      }
      text += r.str
      prev = r
    }
    // NFKC turns Arabic presentation forms and ligatures (ﻟﺨﻼﻳﺎ, ﬁ) back into normal letters.
    text = text.normalize('NFKC').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const size = median(row.map((r) => r.size))
    const left = Math.min(...row.map((r) => r.x))
    const right = Math.max(...row.map((r) => r.x + r.width))
    const top = pageHeight - Math.max(...row.map((r) => r.y + r.size))
    lines.push({ text, size, top, left, width: right - left })
  }
  return lines
}

/** The usual body font size: the size most characters are set in. */
export function bodySize(pages: PageText[]): number {
  const weights = new Map<number, number>()
  for (const p of pages)
    for (const l of p.lines) {
      const k = Math.round(l.size * 2) / 2
      weights.set(k, (weights.get(k) ?? 0) + l.text.length)
    }
  let best = 0
  let bestW = -1
  for (const [k, w] of weights) if (w > bestW) [best, bestW] = [k, w]
  return best || 10
}

const keyOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\d٠-٩]+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()

const isPageNumber = (text: string) =>
  /^[-–—\s]*([\d٠-٩]{1,4}|[ivxlcdm]{1,6})[-–—\s]*$/i.test(text) ||
  /^(page|seite|صفحة)\s*[\d٠-٩]+(\s*(of|von|من)\s*[\d٠-٩]+)?$/i.test(text)

/**
 * Removes running heads, footers and page numbers: lines in the top or bottom margin whose
 * text (digits ignored) repeats on many pages.
 */
export function stripRunningLines(pages: PageText[]): PageText[] {
  const margin = (p: PageText, l: Line) => l.top < p.height * 0.1 || l.top > p.height * 0.88
  const counts = new Map<string, number>()
  for (const p of pages) {
    const seen = new Set<string>()
    for (const l of p.lines) if (margin(p, l)) seen.add(keyOf(l.text))
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3))
  return pages.map((p) => ({
    ...p,
    lines: p.lines.filter(
      (l) =>
        !(margin(p, l) && (isPageNumber(l.text) || (counts.get(keyOf(l.text)) ?? 0) >= threshold)),
    ),
  }))
}

const ENDS_SENTENCE = /[.!?:;؟。…"”»)\]]$/u
const STARTS_LOWER = /^[\p{Ll}]/u

/** Joins a line onto a paragraph, undoing end-of-line hyphenation ("Zell-" + "membran"). */
function joinLine(paragraph: string, line: string): string {
  if (paragraph.endsWith('\u00AD')) return paragraph.slice(0, -1) + line
  if (/[\p{L}]-$/u.test(paragraph)) {
    // "Ein- und Ausgang": a suspended hyphen before a conjunction stays as written.
    if (/^(und|oder|bzw\.?|and|or|sowie)\b/i.test(line)) return `${paragraph} ${line}`
    // "Natrium-" + "Kalium-Pumpe": a real hyphen, joined without a space.
    if (!STARTS_LOWER.test(line)) return paragraph + line
    // "concentra-" + "tion": a word broken at the line end.
    return paragraph.slice(0, -1) + line
  }
  return `${paragraph} ${line}`
}

/**
 * Turns lines into paragraphs: a new paragraph starts after a larger vertical gap, at a change
 * of font size (headings), or after a short line that ends a sentence. A paragraph that runs
 * over a page break is joined and keeps the page it started on.
 */
export function linesToParagraphs(pages: PageText[]): PageParagraph[] {
  const body = bodySize(pages)
  const out: Array<PageParagraph & { open: boolean; size: number }> = []
  for (const p of pages) {
    const gaps: number[] = []
    for (let i = 1; i < p.lines.length; i++) {
      const a = p.lines[i - 1]
      const b = p.lines[i]
      if (a && b && Math.abs(a.size - b.size) < 0.5) gaps.push(b.top - a.top)
    }
    const lineStep = median(gaps.filter((g) => g > 0)) || body * 1.3
    const fullWidth = Math.max(0, ...p.lines.map((l) => l.width))
    let prev: Line | null = null
    p.lines.forEach((line, i) => {
      const last = out[out.length - 1]
      const sizeChange = prev
        ? Math.abs(line.size - prev.size) > Math.max(prev.size, line.size) * 0.15
        : false
      const bigGap = prev ? line.top - prev.top > lineStep * 1.45 : false
      const shortEnd = prev ? prev.width < fullWidth * 0.72 && ENDS_SENTENCE.test(prev.text) : false
      const continuesFromPrevPage =
        i === 0 &&
        last?.open &&
        Math.abs(last.size - line.size) < Math.max(last.size, line.size) * 0.15 &&
        !ENDS_SENTENCE.test(last.text) &&
        (STARTS_LOWER.test(line.text) || /[,\-–]$/.test(last.text))
      if (last && (continuesFromPrevPage || (prev && !sizeChange && !bigGap && !shortEnd))) {
        last.text = joinLine(last.text, line.text)
      } else {
        out.push({ text: line.text, page: p.page, open: true, size: line.size })
      }
      prev = line
    })
    const last = out[out.length - 1]
    if (last) last.open = true
  }
  return out
    .map(({ text, page }) => ({ text: text.replace(/\s+/g, ' ').trim(), page }))
    .filter((p) => p.text.length > 0)
}
