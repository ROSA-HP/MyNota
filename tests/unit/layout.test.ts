import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import { SIZES, computeLayout, mirrorBox } from '@/features/workspace/canvas/layout'
import type { NodeRow } from '@/lib/database.types'

function build(): { nodes: NodeRow[]; ids: Record<string, string> } {
  const root = makeNode({ map_id: 'm', level: 'chapter', title: 'Root' })
  const s1 = makeNode({
    map_id: 'm',
    level: 'section',
    title: 'S1',
    parent_id: root.id,
    sort_order: 0,
  })
  const s2 = makeNode({
    map_id: 'm',
    level: 'section',
    title: 'S2',
    parent_id: root.id,
    sort_order: 1,
  })
  const a = makeNode({ map_id: 'm', level: 'block', title: 'A', parent_id: s1.id, sort_order: 0 })
  const a1 = makeNode({ map_id: 'm', level: 'block', title: 'A1', parent_id: a.id, sort_order: 0 })
  const b = makeNode({ map_id: 'm', level: 'block', title: 'B', parent_id: s1.id, sort_order: 1 })
  const c = makeNode({ map_id: 'm', level: 'block', title: 'C', parent_id: s2.id, sort_order: 0 })
  return {
    nodes: [c, b, a1, a, s2, s1, root],
    ids: { root: root.id, s1: s1.id, s2: s2.id, a: a.id, a1: a1.id, b: b.id, c: c.id },
  }
}

describe('computeLayout', () => {
  it('puts the root on top, sections as columns, blocks stacked and indented', () => {
    const { nodes, ids } = build()
    const L = computeLayout(nodes)
    const box = (k: string) => L.boxes[ids[k]!]!
    expect(box('root').y).toBe(0)
    expect(box('s1').y).toBe(SIZES.sectionTop)
    expect(box('s2').x).toBeGreaterThan(box('s1').x + SIZES.sectionW)
    // Stacked in order A, A1, B under S1; A1 indented one level deeper.
    expect(box('a').y).toBeLessThan(box('a1').y)
    expect(box('a1').y).toBeLessThan(box('b').y)
    expect(box('a1').x - box('a').x).toBe(SIZES.indent)
    expect(box('b').x).toBe(box('a').x)
    // Root centred over all columns.
    expect(box('root').x + SIZES.rootW / 2).toBeCloseTo(L.width / 2)
  })

  it('wraps every section and its blocks in a region', () => {
    const { nodes, ids } = build()
    const L = computeLayout(nodes)
    const r1 = L.regions.find((r) => r.sectionId === ids.s1)!
    for (const k of ['s1', 'a', 'a1', 'b']) {
      const b = L.boxes[ids[k]!]!
      expect(b.x).toBeGreaterThanOrEqual(r1.x)
      expect(b.x + b.w).toBeLessThanOrEqual(r1.x + r1.w)
      expect(b.y + b.h).toBeLessThanOrEqual(r1.y + r1.h)
    }
  })

  it('hides descendants of collapsed nodes and closes the gap', () => {
    const { nodes, ids } = build()
    const collapsed = nodes.map((n) => (n.id === ids.a ? { ...n, collapsed: true } : n))
    const L = computeLayout(collapsed)
    expect(L.hidden.has(ids.a1!)).toBe(true)
    expect(L.boxes[ids.a1!]).toBeUndefined()
    expect(L.boxes[ids.b!]!.y).toBe(L.boxes[ids.a!]!.y + SIZES.blockH + SIZES.rowGap)
  })

  it('uses positions the user dragged to, unless tidying up', () => {
    const { nodes, ids } = build()
    const moved = nodes.map((n) => (n.id === ids.c ? { ...n, position: { x: 999, y: 555 } } : n))
    expect(computeLayout(moved).boxes[ids.c!]).toMatchObject({ x: 999, y: 555 })
    expect(computeLayout(moved, { useSavedPositions: false }).boxes[ids.c!]!.x).not.toBe(999)
  })

  it('is deterministic regardless of input order', () => {
    const { nodes } = build()
    expect(computeLayout([...nodes].reverse()).boxes).toEqual(computeLayout(nodes).boxes)
  })

  it('mirrors boxes for right-to-left display', () => {
    expect(mirrorBox({ x: 10, y: 5, w: 100, h: 20 }, 500)).toEqual({ x: 390, y: 5, w: 100, h: 20 })
  })

  it('keeps mirrorWidth constant when a card is dragged beyond auto bounds', () => {
    const { nodes, ids } = build()
    const base = computeLayout(nodes)
    const moved = nodes.map((n) => (n.id === ids.c ? { ...n, position: { x: 1800, y: 120 } } : n))
    const afterDrag = computeLayout(moved)
    expect(afterDrag.mirrorWidth).toBe(base.mirrorWidth)
    expect(afterDrag.width).toBeGreaterThan(afterDrag.mirrorWidth)
  })

  it('resolves colliding dragged blocks without overlapping other visible cards', () => {
    const { nodes, ids } = build()
    const base = computeLayout(nodes)
    const bBox = base.boxes[ids.b!]!
    const moved = nodes.map((n) =>
      n.id === ids.c ? { ...n, position: { x: bBox.x, y: bBox.y } } : n,
    )
    const L = computeLayout(moved)
    const resolvedC = L.boxes[ids.c!]!
    const resolvedB = L.boxes[ids.b!]!
    const intersects =
      resolvedC.x < resolvedB.x + resolvedB.w &&
      resolvedB.x < resolvedC.x + resolvedC.w &&
      resolvedC.y < resolvedB.y + resolvedB.h &&
      resolvedB.y < resolvedC.y + resolvedC.h
    expect(intersects).toBe(false)
  })

  it('pushes lower section rows down cleanly when an upper row expands via dragging', () => {
    const root = makeNode({ map_id: 'm', level: 'chapter', title: 'Root' })
    const nodes: NodeRow[] = [root]
    const secIds: string[] = []
    const firstBlockIds: string[] = []
    for (let i = 0; i < 6; i++) {
      const s = makeNode({
        map_id: 'm',
        level: 'section',
        title: `S${i}`,
        parent_id: root.id,
        sort_order: i,
      })
      const blk = makeNode({
        map_id: 'm',
        level: 'block',
        title: `B${i}`,
        parent_id: s.id,
        sort_order: 0,
      })
      nodes.push(s, blk)
      secIds.push(s.id)
      firstBlockIds.push(blk.id)
    }
    const base = computeLayout(nodes)
    const firstRowY = base.boxes[secIds[0]!]!.y
    const lowerSec = secIds.find((id) => base.boxes[id]!.y > firstRowY)!
    const origLowerY = base.boxes[lowerSec]!.y
    // Drag upper block 0 far down so row 0 grows taller than row 1's initial top.
    const moved = nodes.map((n) =>
      n.id === firstBlockIds[0] ? { ...n, position: { x: base.boxes[n.id]!.x, y: origLowerY + 80 } } : n,
    )
    const L = computeLayout(moved)
    const upperReg = L.regions.find((r) => r.sectionId === secIds[0])!
    const lowerReg = L.regions.find((r) => r.sectionId === lowerSec)!
    expect(lowerReg.y).toBeGreaterThanOrEqual(upperReg.y + upperReg.h)
  })

  it('handles an empty map and a root without sections', () => {
    expect(computeLayout([]).rootId).toBeNull()
    const root = makeNode({ map_id: 'm', level: 'chapter', title: 'Only' })
    const L = computeLayout([root])
    expect(L.boxes[root.id]).toMatchObject({ y: 0, w: SIZES.rootW })
    expect(L.regions).toEqual([])
  })
})

describe('computeLayout for books', () => {
  function book(chapters: Array<{ sections: number; blocks: number }>) {
    const root = makeNode({ map_id: 'm', level: 'book', title: 'Biology' })
    const nodes: NodeRow[] = [root]
    const chapterIds: string[] = []
    chapters.forEach((c, i) => {
      const ch = makeNode({
        map_id: 'm',
        level: 'chapter',
        title: `Chapter ${i + 1}`,
        parent_id: root.id,
        sort_order: i,
      })
      nodes.push(ch)
      chapterIds.push(ch.id)
      for (let s = 0; s < c.sections; s++) {
        const sec = makeNode({
          map_id: 'm',
          level: 'section',
          title: `S${s}`,
          parent_id: ch.id,
          sort_order: s,
        })
        nodes.push(sec)
        for (let b = 0; b < c.blocks; b++)
          nodes.push(
            makeNode({
              map_id: 'm',
              level: 'block',
              title: `B${b}`,
              parent_id: sec.id,
              sort_order: b,
            }),
          )
      }
    })
    return { nodes, root, chapterIds }
  }

  it('puts each chapter in a region with its tab on top, sections inside', () => {
    const { nodes, chapterIds } = book([
      { sections: 3, blocks: 2 },
      { sections: 0, blocks: 0 },
    ])
    const L = computeLayout(nodes)
    expect(L.book).toBe(true)
    const [c1, c2] = chapterIds
    const r1 = L.regions.find((r) => r.sectionId === c1)!
    const tab = L.boxes[c1!]!
    expect(r1.kind).toBe('chapter')
    expect(r1.built).toBe(true)
    expect(tab.y + tab.h).toBe(r1.y)
    expect(tab.x).toBe(r1.x)
    for (const n of nodes.filter((n) => L.chapterOf[n.id] === c1 && n.id !== c1)) {
      const b = L.boxes[n.id]!
      expect(b.x).toBeGreaterThanOrEqual(r1.x)
      expect(b.x + b.w).toBeLessThanOrEqual(r1.x + r1.w)
      expect(b.y).toBeGreaterThan(r1.y)
      expect(b.y + b.h).toBeLessThanOrEqual(r1.y + r1.h)
    }
    const r2 = L.regions.find((r) => r.sectionId === c2)!
    expect(r2.built).toBe(false)
    expect([r2.w, r2.h]).toEqual([SIZES.waitingW, SIZES.waitingH])
  })

  it('packs chapters into rows instead of one long line and shifts expanded chapters without overlap', () => {
    const { nodes, chapterIds } = book(
      Array.from({ length: 7 }, () => ({ sections: 3, blocks: 1 })),
    )
    const L = computeLayout(nodes)
    const tops = new Set(chapterIds.map((id) => L.boxes[id]!.y))
    expect(tops.size).toBeGreaterThan(1)
    expect(tops.size).toBeLessThan(7)

    // Drag a block in chapter 0 far right & down so chapter 0 expands into neighbors.
    const ch0Block = nodes.find((n) => n.level === 'block' && L.chapterOf[n.id] === chapterIds[0])!
    const moved = nodes.map((n) =>
      n.id === ch0Block.id
        ? { ...n, position: { x: L.boxes[ch0Block.id]!.x + 600, y: L.boxes[ch0Block.id]!.y + 400 } }
        : n,
    )
    const L2 = computeLayout(moved)
    const rs = L2.regions.filter((r) => r.kind === 'chapter')
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i]!
        const b = rs[j]!
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap).toBe(false)
      }
  })

  it('records each section column with minimum zoomed-out card height even for empty sections', () => {
    const { nodes } = book([
      { sections: 2, blocks: 3 },
      { sections: 1, blocks: 0 },
    ])
    const L = computeLayout(nodes)
    const sections = nodes.filter((n) => n.level === 'section')
    expect(L.columns[sections[0]!.id]!.h).toBeGreaterThan(SIZES.sectionH + 3 * SIZES.blockH)
    const emptySection = sections.at(-1)!
    expect(L.columns[emptySection.id]!.h).toBeGreaterThanOrEqual(SIZES.minExpandedSectionH)
  })

  it('shifts section columns alongside dragged sections so zoomed-out section cards stay aligned', () => {
    const { nodes, ids } = build()
    const base = computeLayout(nodes)
    const s2Col = base.columns[ids.s2!]!
    const dx = 180
    const dy = 140
    const subtree = new Set([ids.s2!, ids.c!])
    const moved = nodes.map((n) =>
      subtree.has(n.id)
        ? { ...n, position: { x: base.boxes[n.id]!.x + dx, y: base.boxes[n.id]!.y + dy } }
        : n,
    )
    const L = computeLayout(moved)
    expect(L.columns[ids.s2!]!.x).toBeCloseTo(s2Col.x + dx)
    expect(L.columns[ids.s2!]!.y).toBeCloseTo(s2Col.y + dy)
  })
})
