import type { DetailsResponse } from './details'
import type { OutlineResponse } from './outline'

/**
 * Style rules from docs/ai-pipeline.md ("Visual limits"). These are warnings, not failures:
 * a 7-word title is still usable, and failing the request would cost the student a retry.
 * Warnings carry no content (only counts and positions), so they are safe to record.
 */
export interface RuleWarning {
  rule: 'title_words' | 'summary_words' | 'core_ratio' | 'label_words'
  path: string
  value: number
}

export const countWords = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length

function titleWarnings(title: string, path: string, out: RuleWarning[]) {
  const n = countWords(title)
  if (n < 1 || n > 6) out.push({ rule: 'title_words', path, value: n })
}

function summaryWarnings(summary: string, path: string, out: RuleWarning[]) {
  const n = countWords(summary)
  if (n > 15) out.push({ rule: 'summary_words', path, value: n })
}

export function checkOutlineRules(o: OutlineResponse): RuleWarning[] {
  const out: RuleWarning[] = []
  o.sections.forEach((s, i) => {
    titleWarnings(s.title, `sections.${i}.title`, out)
    summaryWarnings(s.summary, `sections.${i}.summary`, out)
    s.subsections.forEach((sub, j) => {
      titleWarnings(sub.title, `sections.${i}.subsections.${j}.title`, out)
      summaryWarnings(sub.summary, `sections.${i}.subsections.${j}.summary`, out)
    })
  })
  return out
}

export function checkDetailsRules(d: DetailsResponse): RuleWarning[] {
  const out: RuleWarning[] = []
  d.blocks.forEach((b, i) => {
    titleWarnings(b.title, `blocks.${i}.title`, out)
    summaryWarnings(b.summary, `blocks.${i}.summary`, out)
  })
  d.relations.forEach((r, i) => {
    const n = countWords(r.label)
    if (n > 3) out.push({ rule: 'label_words', path: `relations.${i}.label`, value: n })
  })
  const core = d.blocks.filter((b) => b.importance === 'core').length
  // "About one third": allow some slack for small sections (2 of 4 is fine).
  if (d.blocks.length >= 4 && core / d.blocks.length > 0.5) {
    out.push({
      rule: 'core_ratio',
      path: 'blocks',
      value: Math.round((core / d.blocks.length) * 100),
    })
  }
  return out
}
