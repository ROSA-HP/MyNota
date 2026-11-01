import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import type { NodeRow } from '@/lib/database.types'
import { balancedColumns, computeLayout } from '@/features/workspace/canvas/layout'
import { RELATION_FAMILY, relationColor } from '@/features/workspace/canvas/visuals'

const MAP = '9d2b8f0e-4c1a-4b7e-9f3d-2a6c8e1b5d70'

function section(blocks: number, branch_view: NodeRow['branch_view'] = 'tree') {
  const root = makeNode({ map_id: MAP, level: 'chapter', title: 'Optics' })
  const sec = makeNode({
    map_id: MAP,
    level: 'section',
    parent_id: root.id,
    title: 'S',
    branch_view,
  })
  const items = Array.from({ length: blocks }, (_, i) =>
    makeNode({ map_id: MAP, level: 'block', parent_id: sec.id, sort_order: i, title: `B${i}` }),
  )
  return { root, sec, items, all: [root, sec, ...items] }
}

describe('balanced columns (canvas step 3)', () => {
  it('keeps the order and evens out the heights', () => {
    const g = [3, 3, 3, 3, 3, 3].map((h, i) => ({ h, i }))
    expect(balancedColumns(g, 3).map((c) => c.map((x) => x.i))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
    const uneven = [9, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((h, i) => ({ h, i }))
    const cols = balancedColumns(uneven, 2)
    expect(cols.map((c) => c.reduce((s, x) => s + x.h, 0))).toEqual([9, 9])
  })

  it('never makes more columns than groups', () => {
    expect(balancedColumns([{ h: 1 }], 4)).toHaveLength(1)
    expect(balancedColumns([], 3)).toEqual([[]])
  })
})

describe('grouped columns layout', () => {
  it('spreads a long flat section over columns under a centred section card', () => {
    const { sec, items, all } = section(9)
    const L = computeLayout(all)
    const xs = new Set(items.map((n) => L.boxes[n.id]?.x))
    expect(xs.size).toBeGreaterThan(1)
    const col = L.columns[sec.id]
    const card = L.boxes[sec.id]
    expect(card && col && card.x + card.w / 2).toBeCloseTo((col?.x ?? 0) + (col?.w ?? 0) / 2)
    // Every top-level block hangs from the section rail.
    expect(items.every((n) => L.railed.has(n.id))).toBe(true)
  })

  it('keeps process sections in one ordered column with their step arrows', () => {
    const { items, all } = section(9, 'process')
    const L = computeLayout(all)
    expect(new Set(items.map((n) => L.boxes[n.id]?.x)).size).toBe(1)
    expect(items.some((n) => L.railed.has(n.id))).toBe(false)
    const ys = items.map((n) => L.boxes[n.id]?.y ?? 0)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
  })

  it('opening a card never moves blocks to another column', () => {
    const { items, all } = section(9)
    const closed = computeLayout(all)
    const opened = computeLayout(all, { expandedId: items[0]?.id })
    for (const n of items) expect(opened.boxes[n.id]?.x).toBe(closed.boxes[n.id]?.x)
  })
})

describe('link colors', () => {
  it('every link type has a family, and suggestions stay grey', () => {
    expect(Object.keys(RELATION_FAMILY)).toHaveLength(9)
    expect(relationColor({ type: 'causes', status: 'accepted' })).toBe('var(--ch-coral-strong)')
    expect(relationColor({ type: 'example_of', status: 'accepted' })).toBe('var(--ch-sky-strong)')
    expect(relationColor({ type: 'causes', status: 'suggested' })).toBe('var(--ink-muted)')
  })
})
