import type { AiBlock, AiDetail, DetailsResponse } from '../schemas/details'
import { LIMITS } from '../schemas/common'

/**
 * Simpler maps (owner, 2026-11-03: "make mapping more simple for the reader … well organized").
 * After every details reply, small points that the model gave their own block become bullets of
 * the block they belong to:
 * - a sub-block with no formula and almost nothing to say (no details, a short summary);
 * - a sub-block of a sub-block (a third level), unless it holds a formula;
 * - the smallest sub-blocks beyond four under one block.
 * Nothing is lost: the folded block's title and summary become one bullet, its other details
 * move along, its paragraphs are cited by the parent, and links and flashcards follow it there.
 * Top-level blocks (main ideas, process steps, timeline events) are never folded.
 */

/** Sub-blocks a block keeps at most (the prompt asks for the same). */
export const MAX_SUB_BLOCKS = 4

const hasFormula = (b: AiBlock) => b.details.some((d) => d.kind === 'formula')
const size = (b: AiBlock) =>
  b.title.length + b.summary.length + b.details.reduce((n, d) => n + d.text.length, 0)
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** A block that is really a single point: no formula, no details, a short summary. */
function tiny(b: AiBlock): boolean {
  return !hasFormula(b) && b.details.length === 0 && b.summary.length <= 80
}

/** What a folded block becomes inside its parent: one bullet, plus its other details. */
function asDetails(b: AiBlock): AiDetail[] {
  const words = b.details.filter((d) => d.kind === 'bullet' || d.kind === 'text').map((d) => d.text)
  const line = [b.summary, ...words].filter(Boolean).join(' ')
  const bullet: AiDetail = {
    kind: 'bullet',
    text: clip(line ? `${b.title}: ${line}` : b.title, LIMITS.detailChars),
  }
  return [bullet, ...b.details.filter((d) => d.kind !== 'bullet' && d.kind !== 'text')]
}

export function foldSmallBlocks(res: DetailsResponse): DetailsResponse {
  let blocks = res.blocks.map((b) => ({ ...b, details: [...b.details], source: [...b.source] }))
  let relations = [...res.relations]
  let flashcards = [...res.flashcards]
  const byKey = () => new Map(blocks.map((b) => [b.key, b]))
  const childrenOf = (key: string) => blocks.filter((b) => b.parent === key)
  const depthOf = (b: AiBlock): number => {
    const map = byKey()
    let d = 0
    let cur = b.parent ? map.get(b.parent) : undefined
    for (; cur && d < 64; d++) cur = cur.parent ? map.get(cur.parent) : undefined
    return d
  }

  /** Folds `child` into its parent, if the parent has room. */
  const fold = (child: AiBlock): boolean => {
    const parent = child.parent ? byKey().get(child.parent) : undefined
    if (!parent || childrenOf(child.key).length || hasFormula(child)) return false
    const moved = asDetails(child)
    if (parent.details.length + moved.length > LIMITS.maxDetailsPerBlock) return false
    parent.details.push(...moved)
    for (const n of child.source) if (!parent.source.includes(n)) parent.source.push(n)
    blocks = blocks.filter((b) => b !== child)
    relations = relations
      .map((r) => ({
        ...r,
        from: r.from === child.key ? parent.key : r.from,
        to: r.to === child.key ? parent.key : r.to,
      }))
      .filter((r) => r.from !== r.to)
    flashcards = flashcards.map((f) => (f.block === child.key ? { ...f, block: parent.key } : f))
    return true
  }

  // Deepest first, so a folded third level can make room higher up.
  const order = () => [...blocks].sort((a, b) => depthOf(b) - depthOf(a))
  for (const b of order()) if (b.parent && (tiny(b) || depthOf(b) >= 2)) fold(b)

  for (const parent of [...blocks]) {
    const kids = childrenOf(parent.key).sort((a, b) => size(a) - size(b))
    let extra = kids.length - MAX_SUB_BLOCKS
    for (const k of kids) {
      if (extra <= 0) break
      if (fold(k)) extra--
    }
  }

  return { ...res, blocks, relations, flashcards }
}
