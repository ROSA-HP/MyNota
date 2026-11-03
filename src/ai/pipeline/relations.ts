import type { DetailsResponse } from '../schemas/details'

/**
 * Few arrows, each one worth drawing (owner, 2026-11-03: "use less arrows … and if it uses one,
 * make it with the best details, not just an arrow"). After every details reply the section's
 * links are trimmed: a link the tree already shows (parent and child, or an ancestor), a link
 * with a vague label ("related", "see also"), a repeat of the same pair, and the weakest links
 * beyond a small budget all go. What stays says why, in a specific label.
 */

type AiRelation = DetailsResponse['relations'][number]

/** How much a link type teaches beyond the tree (a cause or a derivation more than "related"). */
const WEIGHT: Record<AiRelation['type'], number> = {
  causes: 5,
  derived_from: 5,
  leads_to: 4,
  prerequisite: 4,
  contrasts_with: 4,
  example_of: 3,
  analogy: 2,
  part_of: 1,
  related: 0,
}

/** Labels that say nothing: the type's own words or a generic "linked". */
const VAGUE = new Set([
  'related',
  'relates to',
  'related to',
  'relation',
  'link',
  'linked',
  'links',
  'connected',
  'connection',
  'see also',
  'also',
  'similar',
  'associated',
  'and',
  'with',
  'leads to',
  'part of',
  'example of',
  'causes',
  'derived from',
  'prerequisite',
  'contrasts with',
  'analogy',
  'verwandt',
  'verbunden',
  'zusammenhang',
  'siehe auch',
  'bezug',
  'مرتبط',
  'علاقة',
  'ذو صلة',
  'انظر أيضا',
  'متصل',
])

export function vagueLabel(label: string): boolean {
  const l = label
    .trim()
    .toLowerCase()
    .replace(/[.:!?]+$/, '')
  return !l || VAGUE.has(l)
}

/** How many links a section of `blocks` blocks keeps at most: about one per four, 1 to 4. */
export const relationBudget = (blocks: number): number =>
  Math.min(4, Math.max(1, Math.round(blocks / 4)))

/** Links per block at most, so no card turns into a hub of arrows. */
const PER_BLOCK = 2

/**
 * Keeps only the links worth an arrow: known blocks, no self links, nothing the tree already
 * shows, no vague labels, one link per pair; then the strongest first (type, then a label that
 * says more), within the section's budget and at most two per block.
 */
export function pruneRelations(res: DetailsResponse): DetailsResponse {
  const parent = new Map(res.blocks.map((b) => [b.key, b.parent]))
  const ancestorOf = (a: string, b: string) => {
    // Whether `a` is above `b` in the tree.
    let cur = parent.get(b) ?? null
    for (let guard = 0; cur && guard < 64; guard++) {
      if (cur === a) return true
      cur = parent.get(cur) ?? null
    }
    return false
  }
  const seen = new Set<string>()
  const candidates = res.relations.filter((r) => {
    if (r.from === r.to || !parent.has(r.from) || !parent.has(r.to)) return false
    if (ancestorOf(r.from, r.to) || ancestorOf(r.to, r.from)) return false
    if (vagueLabel(r.label)) return false
    const pair = r.from < r.to ? `${r.from}|${r.to}` : `${r.to}|${r.from}`
    if (seen.has(pair)) return false
    seen.add(pair)
    return true
  })
  const strength = (r: AiRelation) =>
    WEIGHT[r.type] * 10 + Math.min(4, r.label.trim().split(/\s+/).length)
  const ranked = [...candidates].sort((a, b) => strength(b) - strength(a))

  const budget = relationBudget(res.blocks.length)
  const degree = new Map<string, number>()
  const kept: AiRelation[] = []
  for (const r of ranked) {
    if (kept.length >= budget) break
    if ((degree.get(r.from) ?? 0) >= PER_BLOCK || (degree.get(r.to) ?? 0) >= PER_BLOCK) continue
    kept.push(r)
    degree.set(r.from, (degree.get(r.from) ?? 0) + 1)
    degree.set(r.to, (degree.get(r.to) ?? 0) + 1)
  }
  // Keep the reply's order for the ones that stay.
  return { ...res, relations: res.relations.filter((r) => kept.includes(r)) }
}
