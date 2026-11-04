import type { AiBlock, DetailsResponse } from '../schemas/details'
import { LIMITS } from '../schemas/common'
import type { Paragraph } from '../prompts/shared'
import { findEquations } from './formulas'

/**
 * The whole of the student's notes reaches the map (2026-11-03: the owner asked that mapping
 * "gives the whole data"). Models sometimes skip a line. After every details reply, each line of
 * the section's source is checked against everything the blocks say; a line whose key words are
 * mostly absent is added as a bullet to the block it fits best (or, when that block is full, as
 * a new block under it), and its paragraph is cited. Headings and equation-only lines are left
 * to the section titles and the formula safety net.
 */

/** Share of a line's key words that must appear somewhere in the blocks for it to count. */
const PRESENT = 0.34

const STOP = new Set([
  // English
  'that',
  'this',
  'with',
  'from',
  'have',
  'which',
  'when',
  'where',
  'their',
  'there',
  'into',
  'than',
  'then',
  'also',
  'each',
  'such',
  'these',
  'those',
  'they',
  'were',
  'been',
  'being',
  'about',
  'over',
  'under',
  'between',
  'after',
  'before',
  'more',
  'most',
  'other',
  'only',
  'very',
  'will',
  'would',
  'could',
  'should',
  'does',
  'what',
  'while',
  'your',
  'some',
  // German
  'eine',
  'einer',
  'eines',
  'einem',
  'einen',
  'dass',
  'sich',
  'auch',
  'oder',
  'wird',
  'werden',
  'sind',
  'nicht',
  'durch',
  'oder',
  'aber',
  'beim',
  'noch',
  'nach',
  'wenn',
  'dies',
  'diese',
  'dieser',
  'dieses',
  'haben',
  'kann',
  'können',
  // Arabic
  'التي',
  'الذي',
  'هذا',
  'هذه',
  'ذلك',
  'تلك',
  'على',
  'إلى',
  'عند',
  'بين',
  'حيث',
  'كما',
])

/** Key words of a text: words of 4+ letters, lower-cased, without common short words. */
export function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)),
    ),
  ]
}

/** Word stems good enough to match "spreads" with "spread", "minima" with "minimum". */
const stem = (w: string) => w.slice(0, Math.max(4, Math.min(5, w.length - 1)))

function blockText(b: AiBlock): string {
  return [
    b.title,
    b.summary,
    ...b.details.flatMap((d) => [d.text, d.extra ?? '', d.article ?? '', d.plural ?? '']),
  ].join(' ')
}

/**
 * The source as points: lines without their bullet markers, and long lines (a pasted block of
 * prose) split into sentences, so a forgotten point comes back as one sentence, not a whole
 * paragraph.
 */
export function sourceLines(p: Paragraph): string[] {
  return p.text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[*•\-–]|\d+[.)])\s+/, '').trim())
    .flatMap((l) => (l.length > 160 ? l.split(/(?<=[.!?؟])\s+(?=[\p{Lu}\p{Lo}\d])/u) : [l]))
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * Whether a line of the source is only a heading the map already has as a title. Short is not
 * enough: lecture notes are full of short lines without a full stop that are real points, so a
 * line counts only if it is neither a bullet nor a sentence and most of its words are in a title.
 */
export function isHeadingLine(line: string, titles: readonly string[]): boolean {
  const text = line.trim()
  if (!text || text.length > 60 || /^(?:[*•\-–]|\d+[.)])\s/.test(text)) return false
  if (/[.!?؟:;،,]$/.test(text)) return false
  const known = new Set(titles.flatMap(keywords).map(stem))
  const kws = keywords(text)
  return kws.length > 0 && kws.filter((k) => known.has(stem(k))).length / kws.length >= 0.6
}

/** Whether a line is mostly present in the blocks (its key words appear in them). */
export function covered(line: string, stems: Set<string>): boolean {
  const kws = keywords(line)
  if (!kws.length) return true
  const present = kws.filter((k) => stems.has(stem(k))).length
  return present / kws.length >= PRESENT
}

/** A short title for a line: the term before a colon, or its first few words. */
function titleFor(line: string): string {
  const term = /^([^:]{2,60}):/.exec(line)?.[1]?.trim()
  const words = (term ?? line)
    .replace(/\$[^$]*\$/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const title = words
    .slice(0, term ? 6 : 5)
    .join(' ')
    .replace(/[,.;:]+$/, '')
  return (title || line).slice(0, LIMITS.titleChars)
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * Adds every line of the section's source that the reply left out, so nothing in the notes is
 * lost. Returns the reply unchanged when everything is there.
 */
export function ensureCoverage(
  res: DetailsResponse,
  paragraphs: readonly Paragraph[],
): DetailsResponse {
  const blocks = res.blocks.map((b) => ({ ...b, details: [...b.details], source: [...b.source] }))
  const stems = new Set(blocks.flatMap((b) => keywords(blockText(b)).map(stem)))
  let made = 0

  for (const p of paragraphs)
    for (const line of sourceLines(p)) {
      // Equations are the formula net's job; what is left must still say something.
      const rest = pointText(line)
      if (!rest || covered(rest, stems)) continue

      const kws = keywords(line).map(stem)
      const fit = (b: AiBlock) =>
        kws.filter((k) => keywords(blockText(b)).map(stem).includes(k)).length +
        (b.source.includes(p.n) ? 1 : 0)
      const best = blocks.reduce<AiBlock | undefined>(
        (top, b) => (!top || fit(b) > fit(top) ? b : top),
        undefined,
      )
      const bullet = { kind: 'bullet' as const, text: clip(line, LIMITS.detailChars) }
      if (best && best.details.length < LIMITS.maxDetailsPerBlock) {
        best.details.push(bullet)
        if (!best.source.includes(p.n)) best.source.push(p.n)
      } else if (blocks.length < LIMITS.maxBlocksPerSection) {
        const children = blocks.filter((b) => b.parent === (best?.key ?? null)).length
        blocks.push({
          key: `cov${++made}`,
          parent: best && children < LIMITS.maxChildren ? best.key : null,
          title: titleFor(line),
          summary: clip(line, LIMITS.summaryChars),
          type: 'concept',
          importance: 'supporting',
          details: [bullet],
          source: [p.n],
          added: false,
          added_reason: null,
        })
      }
      for (const k of keywords(line)) stems.add(stem(k))
    }

  return { ...res, blocks }
}

/** A point of the source the map should carry: a line or sentence with something to say. */
function pointText(line: string): string | null {
  const words = line.replace(/\$[^$]*\$/g, ' ')
  const rest = findEquations(words).reduce((s, eq) => s.replace(eq, ' '), words)
  return keywords(rest).length >= 3 ? rest : null
}

/**
 * The points of a section's source that the reply itself leaves out (before the safety nets fill
 * the gaps), and how many points there are in all. The admin MCP mapper shows these to the model
 * so it can place them itself, instead of leaving them to the net.
 */
export function missedPoints(
  res: DetailsResponse,
  paragraphs: readonly Paragraph[],
): { points: number; missed: Array<{ paragraph: number; text: string }> } {
  const stems = new Set(res.blocks.flatMap((b) => keywords(blockText(b)).map(stem)))
  let points = 0
  const missed: Array<{ paragraph: number; text: string }> = []
  for (const p of paragraphs)
    for (const line of sourceLines(p)) {
      const text = pointText(line)
      if (!text) continue
      points++
      if (!covered(text, stems)) missed.push({ paragraph: p.n, text: line })
    }
  return { points, missed }
}

/**
 * How much of a section's source the reply itself carries (before the safety nets fill the
 * gaps): the number of points, and how many of them are missing. For the quality report.
 */
export function measureCoverage(
  res: DetailsResponse,
  paragraphs: readonly Paragraph[],
): { points: number; missed: number } {
  const { points, missed } = missedPoints(res, paragraphs)
  return { points, missed: missed.length }
}
