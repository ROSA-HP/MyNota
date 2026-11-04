import type { Paragraph } from '../src/ai/prompts/shared'
import { ensureCoverage, isHeadingLine, keywords, missedPoints } from '../src/ai/pipeline/coverage'
import { ensureFormulas, sameFormula } from '../src/ai/pipeline/formulas'
import { pruneRelations } from '../src/ai/pipeline/relations'
import { foldSmallBlocks } from '../src/ai/pipeline/simplify'
import { countWords, checkDetailsRules, checkOutlineRules } from '../src/ai/schemas/rules'
import { detailsSchemaFor, type AiBlock, type DetailsResponse } from '../src/ai/schemas/details'
import { normalizeOutline, outlineSchemaFor, type OutlineResponse } from '../src/ai/schemas/outline'
import { weakSections } from '../src/features/workspace/buildQuality'

/**
 * The app's own rules, run on the model's work, with the results handed back to it.
 *
 * In the app a reply gets one repair try and the safety nets quietly fix the rest. Here the model
 * can look again, so each check names what is wrong and where, and it can fix things better
 * than a net can (a net can only add a stray bullet; the model can put the point where it
 * belongs). The nets still run on the final answer, so nothing is lost if it stops early.
 */

export interface Issue {
  rule: string
  /** What is wrong and how to fix it. */
  message: string
  paragraph?: number
  block?: string
}

export interface SectionReport {
  status: 'good' | 'needs_fixes'
  /** Things that would be lost, moved or changed by the safety nets. */
  fixes: Issue[]
  /** Style advice: worth doing, not worth another round on its own. */
  notes: Issue[]
  stats: {
    blocks: number
    main_blocks: number
    formulas: number
    relations: number
    flashcards: number
    points: number
    missed_points: number
    coverage_percent: number
  }
}

const issuesOf = (error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] =>
  error.issues.map((i) => `${i.path.map(String).join('.') || 'answer'}: ${i.message}`)

export type OutlineCheck =
  { ok: false; errors: string[] } | { ok: true; outline: OutlineResponse; notes: Issue[] }

export function checkOutline(raw: unknown, paragraphCount: number): OutlineCheck {
  const parsed = outlineSchemaFor(paragraphCount).safeParse(raw)
  if (!parsed.success) return { ok: false, errors: issuesOf(parsed.error) }
  const outline = normalizeOutline(parsed.data, paragraphCount)
  const notes = checkOutlineRules(outline).map((w) => ({
    rule: w.rule,
    message:
      w.rule === 'title_words'
        ? `${w.path} has ${w.value} words; titles are 2-6 words.`
        : `${w.path} has ${w.value} words; summaries are at most 15 words.`,
  }))
  return { ok: true, outline, notes }
}

/**
 * The section's source without the headings the map already shows as titles. Without this a
 * heading counts as a forgotten point, and the coverage net would add it to a block as a bullet.
 */
export function withoutHeadings(
  paragraphs: readonly Paragraph[],
  titles: readonly string[],
): Paragraph[] {
  return paragraphs.flatMap((p) => {
    const lines = p.text.split('\n').filter((line) => !isHeadingLine(line, titles))
    return lines.length ? [{ ...p, text: lines.join('\n') }] : []
  })
}

/** What the app would save: the same four steps, in the same order, as a build in the browser. */
export function finalSection(
  answer: DetailsResponse,
  paragraphs: readonly Paragraph[],
): DetailsResponse {
  return pruneRelations(
    foldSmallBlocks(ensureCoverage(ensureFormulas(answer, paragraphs), paragraphs)),
  )
}

const formulasIn = (b: AiBlock) => b.details.filter((d) => d.kind === 'formula').map((d) => d.text)

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Tab, form feed, backspace, carriage return: what \theta, \frac, \beta and \rho turn into. */
const BROKEN_ESCAPE = /[\t\f\b\r\n]/

function formulaIssues(answer: DetailsResponse, paragraphs: readonly Paragraph[]): Issue[] {
  const out: Issue[] = []
  const seen: Array<{ text: string; block: string }> = []
  for (const b of answer.blocks)
    for (const text of formulasIn(b)) {
      if (BROKEN_ESCAPE.test(text)) {
        out.push({
          rule: 'formula_escape',
          block: b.key,
          message: `A formula in "${b.title}" has a broken backslash: in JSON every LaTeX backslash is written twice (\\\\theta, not \\theta).`,
        })
      }
      const first = seen.find((s) => s.block !== b.key && sameFormula(s.text, text))
      if (first) {
        out.push({
          rule: 'formula_copied',
          block: b.key,
          message: `"${clip(text, 60)}" is on blocks ${first.block} and ${b.key}. Keep it on the block about it; link from there to the other (type leads_to) if needed.`,
        })
      }
      seen.push({ text, block: b.key })
    }

  const known = answer.blocks.flatMap(formulasIn)
  const netted = ensureFormulas(answer, paragraphs)
  for (const b of netted.blocks)
    for (const text of formulasIn(b)) {
      if (known.some((k) => sameFormula(k, text))) continue
      out.push({
        rule: 'formula_missing',
        block: b.key,
        message: `"${clip(text, 80)}" appears in the source but is not a formula detail. Add it to the block about it, with its symbols explained in "extra".`,
      })
    }
  return out
}

function citationIssues(
  answer: DetailsResponse,
  paragraphs: readonly Paragraph[],
  own: ReadonlySet<number>,
): Issue[] {
  const cited = new Set(answer.blocks.flatMap((b) => b.source))
  const out: Issue[] = []
  for (const b of answer.blocks) {
    const outside = b.source.filter((n) => !own.has(n))
    if (outside.length) {
      out.push({
        rule: 'citation_outside_section',
        block: b.key,
        message: `"${b.title}" cites ${outside.map((n) => `P${n}`).join(', ')}, outside this section. Cite only this section's paragraphs.`,
      })
    }
  }
  for (const p of paragraphs) {
    // A heading has nothing to cite; it is already the section's or a block's title.
    if (cited.has(p.n) || keywords(p.text).length < 3) continue
    out.push({
      rule: 'paragraph_not_cited',
      paragraph: p.n,
      message: `No block cites P${p.n}. Cite it on the block that carries its content.`,
    })
  }
  return out
}

function structureNotes(answer: DetailsResponse, shape: string): Issue[] {
  const notes: Issue[] = []
  const main = answer.blocks.filter((b) => b.parent === null).length
  const ordered = shape === 'process' || shape === 'timeline'
  if (main > 6 && !ordered) {
    notes.push({
      rule: 'too_many_main_blocks',
      message: `${main} main blocks; 3-6 read best. Group some under a shared idea.`,
    })
  }
  if (answer.relations.length > 3) {
    notes.push({
      rule: 'too_many_relations',
      message: `${answer.relations.length} relations; at most 3, each teaching what the tree does not show.`,
    })
  }
  for (const b of answer.blocks) {
    if (countWords(b.title) > 5) {
      notes.push({
        rule: 'long_title',
        block: b.key,
        message: `"${b.title}" has ${countWords(b.title)} words; titles are 2-5 words.`,
      })
    }
    if (countWords(b.summary) > 10) {
      notes.push({
        rule: 'long_summary',
        block: b.key,
        message: `The summary of "${b.title}" has ${countWords(b.summary)} words; at most 10.`,
      })
    }
  }
  for (const w of checkDetailsRules(answer)) {
    if (w.rule === 'core_ratio') {
      notes.push({
        rule: 'too_many_core',
        message: `${w.value}% of blocks are core; about a third should be.`,
      })
    }
  }
  return notes
}

/** Blocks the app would turn into bullets, and arrows it would drop. */
function simplifyIssues(answer: DetailsResponse): Issue[] {
  const folded = foldSmallBlocks(answer)
  const kept = new Set(folded.blocks.map((b) => b.key))
  const out: Issue[] = answer.blocks
    .filter((b) => !kept.has(b.key))
    .map((b) => ({
      rule: 'block_too_small',
      block: b.key,
      message: `"${b.title}" would be folded into its parent as a bullet. Make it a bullet yourself, or give it real content (at most 4 sub-blocks, 2 levels).`,
    }))
  // Compared with the answer, not the folded copy: a fold can already have dropped an arrow (one
  // between a block and the parent it folds into). Folding keeps the type and label of the rest.
  const pruned = pruneRelations(folded)
  for (const r of answer.relations) {
    if (pruned.relations.some((p) => p.type === r.type && p.label === r.label)) continue
    out.push({
      rule: 'relation_dropped',
      message: `The arrow ${r.from} → ${r.to} ("${r.label}") would be dropped. The tree may already show it, its label may be vague, or the section has too many arrows.`,
    })
  }
  return out
}

export interface SectionContext {
  /** The section's paragraphs with their headings taken out (`withoutHeadings`). */
  paragraphs: readonly Paragraph[]
  /** Every paragraph number of the section, including those that are only a heading. */
  numbers: readonly number[]
  /** Paragraphs in the whole chapter: citations are numbered across it. */
  paragraphCount: number
  shape: string
}

export type SectionCheck =
  { ok: false; errors: string[] } | { ok: true; answer: DetailsResponse; report: SectionReport }

export function checkSection(raw: unknown, ctx: SectionContext): SectionCheck {
  const parsed = detailsSchemaFor(ctx.paragraphCount).safeParse(raw)
  if (!parsed.success) return { ok: false, errors: issuesOf(parsed.error) }
  const answer = parsed.data

  const { points, missed } = missedPoints(answer, ctx.paragraphs)
  const fixes: Issue[] = [
    ...missed.map((m) => ({
      rule: 'point_missing',
      paragraph: m.paragraph,
      message: `Not on the map yet (P${m.paragraph}): "${clip(m.text, 200)}"`,
    })),
    ...formulaIssues(answer, ctx.paragraphs),
    ...citationIssues(answer, ctx.paragraphs, new Set(ctx.numbers)),
    ...simplifyIssues(answer),
  ]
  const formulas = new Set(answer.blocks.flatMap(formulasIn)).size
  const stats = {
    blocks: answer.blocks.length,
    main_blocks: answer.blocks.filter((b) => b.parent === null).length,
    formulas,
    relations: answer.relations.length,
    flashcards: answer.flashcards.length,
    points,
    missed_points: missed.length,
    coverage_percent: points ? Math.round(((points - missed.length) / points) * 100) : 100,
  }
  // The same test as the app's "weak section" report.
  const weak = weakSections({
    s: { title: '', points, missed: missed.length, formulas, blocks: answer.blocks.length },
  }).length
  if (weak && answer.blocks.length > 16) {
    fixes.push({
      rule: 'too_many_blocks',
      message: `${answer.blocks.length} blocks is a crowd; about 6-14 is right. Turn small points into bullets.`,
    })
  } else if (weak && answer.blocks.length <= 1) {
    fixes.push({
      rule: 'too_few_blocks',
      message: `${points} points in one block is too squeezed. Split it into main ideas.`,
    })
  }

  return {
    ok: true,
    answer,
    report: {
      status: fixes.length ? 'needs_fixes' : 'good',
      fixes,
      notes: structureNotes(answer, ctx.shape),
      stats,
    },
  }
}
