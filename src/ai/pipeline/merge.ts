import type { BranchView, DetailBlock, NodeRow } from '@/lib/database.types'
import type { Paragraph } from '../prompts/shared'
import type { MergeBlock, MergeItem, MergeResponse } from '../schemas/merge'
import { PALETTE, makeNode } from './convert'
import { findEquations, sameFormula, toLatex } from './formulas'

/**
 * Merge mode ("Add notes", docs/ai-pipeline.md › Modes): the model sees the existing map as a
 * short outline with S…/B… ids and decides, for each group of new notes, to attach new
 * blocks, add a detail, start a new section, or skip a duplicate. The student reviews the
 * plan; nothing changes until they apply it.
 */
export interface MergeContext {
  outline: string
  /** Short id (S1, B4) → node id. */
  idMap: Map<string, string>
  ids: { sections: Set<string>; blocks: Set<string> }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function childrenIndex(nodes: Record<string, NodeRow>) {
  const map = new Map<string, NodeRow[]>()
  for (const n of Object.values(nodes)) {
    if (!n.parent_id) continue
    const list = map.get(n.parent_id) ?? []
    list.push(n)
    map.set(n.parent_id, list)
  }
  for (const list of map.values())
    list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  return map
}

/** The part of the map the notes go into (a notes map's root, or one book chapter). */
export function mergeOutline(
  nodes: Record<string, NodeRow>,
  rootId: string,
  maxSummaries = 150,
): MergeContext {
  const kids = childrenIndex(nodes)
  const idMap = new Map<string, string>()
  const ids = { sections: new Set<string>(), blocks: new Set<string>() }
  const lines: string[] = []
  let blockCount = 0
  ;(kids.get(rootId) ?? []).forEach((section, i) => {
    const sid = `S${i + 1}`
    idMap.set(sid, section.id)
    ids.sections.add(sid)
    lines.push(
      `${sid} ${clip(section.title, 80)}${section.summary ? ` — ${clip(section.summary, 80)}` : ''}`,
    )
    const walk = (pid: string, depth: number) => {
      for (const b of kids.get(pid) ?? []) {
        blockCount += 1
        const bid = `B${blockCount}`
        idMap.set(bid, b.id)
        ids.blocks.add(bid)
        const summary = blockCount <= maxSummaries && b.summary ? ` — ${clip(b.summary, 60)}` : ''
        lines.push(`${'  '.repeat(depth)}${bid} ${clip(b.title, 80)}${summary}`)
        walk(b.id, depth + 1)
      }
    }
    walk(section.id, 1)
  })
  return { outline: lines.join('\n'), idMap, ids }
}

export interface PlanItem {
  key: string
  action: MergeItem['action']
  notes: number[]
  /** attach: the section or block the new blocks go under (node ids from here on). */
  parentId: string | null
  afterId: string | null
  /** detail: the block that gets the new line. */
  targetId: string | null
  /** skip: the node the notes repeat. */
  duplicateOfId: string | null
  section: MergeItem['section']
  blocks: MergeBlock[]
  detail: string | null
  /** Ticked in the preview. Skipped duplicates start unticked ("Add them anyway"). */
  include: boolean
}

const firstWords = (text: string, n = 6) =>
  clip(text.replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' '), 80)

/**
 * The reply as a reviewable plan: short ids become node ids, a note used twice keeps only its
 * first place, and notes the model left out are gathered into one extra section so nothing
 * the student typed is lost.
 */
export function toPlan(
  res: MergeResponse,
  ctx: MergeContext,
  notes: Paragraph[],
  fallbackTitle: string,
): PlanItem[] {
  const node = (id: string | null) => (id ? (ctx.idMap.get(id) ?? null) : null)
  const valid = new Set(notes.map((p) => p.n))
  const used = new Set<number>()
  const items: PlanItem[] = []
  res.items.forEach((it, i) => {
    const mine = [...new Set(it.notes)].filter((n) => valid.has(n) && !used.has(n))
    const blocks = it.blocks
      .map((b) => ({ ...b, notes: [...new Set(b.notes)].filter((n) => valid.has(n)) }))
      .filter((b) => b.notes.length)
    if (!mine.length && !(it.action !== 'skip' && blocks.length)) return
    mine.forEach((n) => used.add(n))
    blocks.forEach((b) => b.notes.forEach((n) => used.add(n)))
    const item: PlanItem = {
      key: `m${i}`,
      action: it.action,
      notes: [...new Set([...mine, ...blocks.flatMap((b) => b.notes)])].sort((a, b) => a - b),
      parentId: node(it.parent),
      afterId: node(it.after),
      targetId: node(it.target),
      duplicateOfId: node(it.duplicate_of),
      section: it.section,
      blocks,
      detail: it.detail,
      include: it.action !== 'skip',
    }
    // Anything that lost its place becomes a new section rather than being dropped.
    if (item.action === 'attach' && !item.parentId) item.action = 'new_section'
    if (item.action === 'detail' && !item.targetId) {
      item.action = 'new_section'
      if (!item.blocks.length)
        item.blocks = item.notes.map((n) => ({
          title: firstWords(notes.find((p) => p.n === n)?.text ?? ''),
          summary: '',
          type: 'concept' as const,
          importance: 'supporting' as const,
          notes: [n],
          added: false,
          added_reason: null,
        }))
    }
    if (item.action === 'new_section' && !item.section)
      item.section = { title: fallbackTitle, summary: '', shape: 'tree' }
    items.push(item)
  })
  const missing = notes.filter((p) => !used.has(p.n))
  if (missing.length)
    items.push({
      key: 'm-rest',
      action: 'new_section',
      notes: missing.map((p) => p.n),
      parentId: null,
      afterId: null,
      targetId: null,
      duplicateOfId: null,
      section: { title: fallbackTitle, summary: '', shape: 'tree' },
      blocks: missing.map((p) => ({
        title: firstWords(p.text),
        summary: clip(p.text.replace(/\s+/g, ' '), 120),
        type: 'concept',
        importance: 'supporting',
        notes: [p.n],
        added: false,
        added_reason: null,
      })),
      detail: null,
      include: true,
    })
  return items
}

export interface ApplyResult {
  add: NodeRow[]
  patches: Array<{ id: string; patch: Partial<NodeRow> }>
}

/**
 * Turns the ticked plan items into new nodes and edits. Note N becomes paragraph P(offset+N)
 * of the map's source, so every new block cites stored text.
 */
export function applyPlan(
  items: PlanItem[],
  ctx: {
    mapId: string
    rootId: string
    nodes: Record<string, NodeRow>
    notes: Paragraph[]
    offset: number
    lang: string | null
  },
): ApplyResult {
  const kids = childrenIndex(ctx.nodes)
  const toP = (ns: number[]) => [...new Set(ns.map((n) => ctx.offset + n))].sort((a, b) => a - b)
  const dir = ctx.lang === 'ar' ? 'rtl' : 'ltr'
  const add: NodeRow[] = []
  const edits = new Map<string, Partial<NodeRow>>()
  /** Children order per parent, existing and new, to renumber sort_order at the end. */
  const order = new Map<string, string[]>()
  const childIds = (pid: string) => {
    let list = order.get(pid)
    if (!list) {
      list = (kids.get(pid) ?? [])
        .map((n) => n.id)
        .concat(add.filter((n) => n.parent_id === pid).map((n) => n.id))
      order.set(pid, list)
    }
    return list
  }
  /** The equations in some notes as formula details (models drop them; never lose one). */
  const formulasIn = (text: string, have: DetailBlock[] = []): DetailBlock[] =>
    findEquations(text)
      .filter((eq) => !have.some((d) => d.kind === 'formula' && sameFormula(d.latex, eq)))
      .map((eq) => ({ kind: 'formula', latex: toLatex(eq) }))
  const blockNode = (b: MergeBlock, parentId: string) =>
    makeNode({
      details: formulasIn(noteText(b.notes)),
      map_id: ctx.mapId,
      parent_id: parentId,
      level: 'block',
      title: b.title,
      summary: b.summary,
      type: b.type,
      importance: b.importance,
      source: { paragraphs: toP(b.notes) },
      ai_added: b.added,
      ai_added_reason: b.added ? b.added_reason : null,
      lang: ctx.lang,
      dir,
      origin: 'ai',
    })
  const insert = (parentId: string, afterId: string | null, nodes: NodeRow[]) => {
    const list = childIds(parentId)
    const at = afterId && list.includes(afterId) ? list.indexOf(afterId) + 1 : list.length
    list.splice(at, 0, ...nodes.map((n) => n.id))
    add.push(...nodes)
  }
  const addDetail = (id: string, text: string, notes: number[]) => {
    const target = ctx.nodes[id]
    if (!target) return
    const cur = edits.get(id) ?? {}
    const before = cur.details ?? target.details
    const added = formulasIn(text, before)
    // New formulas go after the block's existing ones (the card shows its first formula).
    const at = before.filter((d) => d.kind === 'formula').length
    const details: DetailBlock[] = [
      ...before.slice(0, at),
      ...added,
      ...before.slice(at),
      { kind: 'text', text: clip(text, 600) },
    ]
    const paragraphs = [
      ...new Set([...(cur.source ?? target.source).paragraphs, ...toP(notes)]),
    ].sort((a, b) => a - b)
    edits.set(id, { ...cur, details, source: { ...target.source, paragraphs } })
  }
  const noteText = (ns: number[]) =>
    ns
      .map((n) => ctx.notes.find((p) => p.n === n)?.text ?? '')
      .filter(Boolean)
      .join(' ')
  let newSections = 0
  const sectionCount = (kids.get(ctx.rootId) ?? []).length

  for (const item of items) {
    if (!item.include) continue
    if (item.action === 'skip') {
      // "Add them anyway": the repeated notes become details on the node they repeat.
      if (item.duplicateOfId && ctx.nodes[item.duplicateOfId])
        addDetail(item.duplicateOfId, noteText(item.notes), item.notes)
      continue
    }
    if (item.action === 'detail' && item.targetId) {
      addDetail(item.targetId, item.detail ?? noteText(item.notes), item.notes)
      continue
    }
    if (item.action === 'attach' && item.parentId && ctx.nodes[item.parentId]) {
      insert(
        item.parentId,
        item.afterId,
        item.blocks.map((b) => blockNode(b, item.parentId as string)),
      )
      continue
    }
    // new_section (or an attach whose parent is gone)
    const section = makeNode({
      map_id: ctx.mapId,
      parent_id: ctx.rootId,
      level: 'section',
      title: item.section?.title ?? item.blocks[0]?.title ?? '…',
      summary: item.section?.summary ?? '',
      branch_view: (item.section?.shape ?? 'tree') as BranchView,
      color: PALETTE[(sectionCount + newSections) % PALETTE.length] ?? 'yellow',
      importance: 'core',
      source: { paragraphs: toP(item.notes) },
      lang: ctx.lang,
      dir,
      origin: 'ai',
    })
    newSections += 1
    insert(ctx.rootId, null, [section])
    insert(
      section.id,
      null,
      item.blocks.map((b) => blockNode(b, section.id)),
    )
  }

  // Renumber children where something was inserted.
  const newIds = new Set(add.map((n) => n.id))
  for (const [, list] of order)
    list.forEach((id, i) => {
      if (newIds.has(id)) {
        const n = add.find((x) => x.id === id)
        if (n) n.sort_order = i
      } else if (ctx.nodes[id] && ctx.nodes[id].sort_order !== i) {
        edits.set(id, { ...(edits.get(id) ?? {}), sort_order: i })
      }
    })
  return { add, patches: [...edits].map(([id, patch]) => ({ id, patch })) }
}

/** The next paragraph number free in a chapter's sources (new notes continue after it). */
export function nextParagraphOffset(
  sources: Array<{ chapter_node_id: string | null; paragraphs: Array<{ n: number }> }>,
  rootId: string,
): number {
  let max = 0
  for (const s of sources)
    if (s.chapter_node_id === rootId) for (const p of s.paragraphs) max = Math.max(max, p.n)
  return max
}
