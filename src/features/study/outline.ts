import type { NodeRow } from '@/lib/database.types'

export type StudyNode = Pick<NodeRow, 'id' | 'parent_id' | 'level' | 'title' | 'sort_order'>

/** Where a block sits: its chapter (number and title) for the label above each card. */
export interface BlockPlace {
  title: string
  chapter: { n: number; title: string } | null
  section: string | null
}

/** Outline order (depth first by sort order) and each block's chapter and section. */
export function describeNodes(nodes: StudyNode[]) {
  const kids = new Map<string | null, StudyNode[]>()
  for (const n of nodes) {
    const list = kids.get(n.parent_id) ?? []
    list.push(n)
    kids.set(n.parent_id, list)
  }
  for (const list of kids.values()) list.sort((a, b) => a.sort_order - b.sort_order)
  const ids = new Set(nodes.map((n) => n.id))
  const roots = nodes.filter((n) => !n.parent_id || !ids.has(n.parent_id))
  roots.sort((a, b) => a.sort_order - b.sort_order)

  const order = new Map<string, number>()
  const places = new Map<string, BlockPlace>()
  const walk = (n: StudyNode, chapter: BlockPlace['chapter'], section: string | null) => {
    order.set(n.id, order.size)
    if (n.level === 'block') places.set(n.id, { title: n.title, chapter, section })
    let chapterNo = 0
    for (const k of kids.get(n.id) ?? []) {
      if (k.level === 'chapter') chapterNo += 1
      walk(
        k,
        k.level === 'chapter' ? { n: chapterNo, title: k.title } : chapter,
        k.level === 'section' ? k.title : section,
      )
    }
  }
  for (const r of roots) walk(r, null, null)
  return { order, places }
}

/** A chapter (book maps) or top-level section (notes maps) and the blocks under it. */
export interface DeckGroup {
  id: string
  n: number
  title: string
  blocks: Set<string>
  /** False for a book chapter that has not been built yet (nothing under it). */
  built: boolean
}

/** The deck's rows "by chapter": chapters of a book, or the sections of a notes map. */
export function deckGroups(nodes: StudyNode[]): DeckGroup[] {
  const kids = new Map<string, StudyNode[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const list = kids.get(n.parent_id) ?? []
    list.push(n)
    kids.set(n.parent_id, list)
  }
  for (const list of kids.values()) list.sort((a, b) => a.sort_order - b.sort_order)
  const ids = new Set(nodes.map((n) => n.id))
  const root = nodes.find((n) => !n.parent_id || !ids.has(n.parent_id))
  if (!root) return []
  const top = kids.get(root.id) ?? []
  const chapters = top.filter((n) => n.level === 'chapter')
  const heads = chapters.length ? chapters : top.filter((n) => n.level === 'section')
  return heads.map((h, i) => {
    const blocks = new Set<string>()
    const stack = [...(kids.get(h.id) ?? [])]
    while (stack.length) {
      const n = stack.pop() as StudyNode
      if (n.level === 'block') blocks.add(n.id)
      stack.push(...(kids.get(n.id) ?? []))
    }
    return { id: h.id, n: i + 1, title: h.title, blocks, built: (kids.get(h.id) ?? []).length > 0 }
  })
}
