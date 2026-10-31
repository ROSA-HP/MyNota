import type { DetailsResponse } from '@/ai/schemas/details'
import type { OutlineResponse } from '@/ai/schemas/outline'
import { checkDetailsRules, checkOutlineRules, type RuleWarning } from '@/ai/schemas/rules'

/**
 * Automatic checks of a model's output for the prompt test set (Phase 7.7,
 * docs/ai-pipeline.md › Prompt quality testing). The manual checks (does a teacher agree with
 * the outline; do sources point at the right paragraphs) stay with people.
 */

export interface SectionResult {
  title: string
  paragraphs: { from: number; to: number }
  details: DetailsResponse | null
  /** Why the details pass failed, when it did. */
  error?: string
}

export interface QualityReport {
  paragraphs: number
  sections: number
  blocks: number
  /** Share of paragraphs that some block cites as its source (0..1). */
  coverage: number
  missing: number[]
  /** Blocks with no source that are not marked as added by the model. */
  unsourced: number
  /** Blocks the model marked as added (not in the text). */
  added: number
  /** Sources pointing outside the section's paragraphs. */
  outOfRange: number
  /** Parents with more than 7 children. */
  crowded: number
  coreRatio: number
  failedSections: number
  warnings: Record<RuleWarning['rule'], number>
  /** 0..100: coverage first, then faithfulness, then the visual rules. */
  score: number
}

export function scoreRun(
  paragraphCount: number,
  outline: OutlineResponse | null,
  sections: SectionResult[],
): QualityReport {
  const cited = new Set<number>()
  let blocks = 0
  let unsourced = 0
  let added = 0
  let outOfRange = 0
  let crowded = 0
  let core = 0
  const warnings: Record<RuleWarning['rule'], number> = {
    title_words: 0,
    summary_words: 0,
    core_ratio: 0,
    label_words: 0,
  }
  for (const w of outline ? checkOutlineRules(outline) : []) warnings[w.rule]++

  for (const s of sections) {
    const d = s.details
    if (!d) continue
    for (const w of checkDetailsRules(d)) warnings[w.rule]++
    const children = new Map<string, number>()
    for (const b of d.blocks) {
      blocks++
      if (b.importance === 'core') core++
      if (b.added) added++
      else if (!b.source.length) unsourced++
      for (const p of b.source) {
        if (p < s.paragraphs.from || p > s.paragraphs.to) outOfRange++
        else cited.add(p)
      }
      const parent = b.parent ?? ''
      children.set(parent, (children.get(parent) ?? 0) + 1)
    }
    for (const n of children.values()) if (n > 7) crowded++
  }

  const missing: number[] = []
  for (let p = 1; p <= paragraphCount; p++) if (!cited.has(p)) missing.push(p)
  const coverage = paragraphCount ? (paragraphCount - missing.length) / paragraphCount : 1
  const failedSections = sections.filter((s) => !s.details).length
  const coreRatio = blocks ? core / blocks : 0
  const warningCount = Object.values(warnings).reduce((a, b) => a + b, 0)

  // Coverage is worth 50, faithfulness 30, visual rules 20; a failed section costs its share.
  const faithful = blocks ? 1 - (unsourced + outOfRange) / blocks : 0
  const visual = blocks ? Math.max(0, 1 - (warningCount + crowded) / blocks) : 0
  const completed = sections.length ? 1 - failedSections / sections.length : 0
  const score = Math.round(
    (coverage * 50 + Math.max(0, faithful) * 30 + visual * 20) * (outline ? completed : 0),
  )

  return {
    paragraphs: paragraphCount,
    sections: sections.length,
    blocks,
    coverage: Math.round(coverage * 1000) / 1000,
    missing,
    unsourced,
    added,
    outOfRange,
    crowded,
    coreRatio: Math.round(coreRatio * 100) / 100,
    failedSections,
    warnings,
    score,
  }
}
