import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import { SIZES, computeLayout } from '@/features/workspace/canvas/layout'
import type { NodeRow } from '@/lib/database.types'

// A more organised map (owner, 2026-11-03): sections in rows, tidy boxes, a neat title line.
const MAP = 'm'

function notesMap(sections: number, blocksEach: number[]) {
  const root = makeNode({ map_id: MAP, level: 'chapter', title: 'Notes' })
  const nodes: NodeRow[] = [root]
  const ids: string[] = []
  for (let i = 0; i < sections; i++) {
    const s = makeNode({
      map_id: MAP,
      level: 'section',
      title: `Section ${i + 1}`,
      parent_id: root.id,
      sort_order: i,
    })
    nodes.push(s)
    ids.push(s.id)
    for (let j = 0; j < (blocksEach[i] ?? 2); j++)
      nodes.push(
        makeNode({
          map_id: MAP,
          level: 'block',
          title: `Block ${i + 1}.${j + 1}`,
          summary: 'A short line.',
          parent_id: s.id,
          sort_order: j,
        }),
      )
  }
  return { nodes, ids, root }
}

describe('sections in rows', () => {
  const { nodes, ids } = notesMap(7, [2, 3, 2, 4, 2, 3, 2])
  const L = computeLayout(nodes)
  const box = (id: string) => L.boxes[id] as { x: number; y: number; w: number; h: number }

  it('wraps into rows read left to right, top to bottom', () => {
    const rows = [...new Set(ids.map((id) => box(id).y))]
    expect(rows.length).toBeGreaterThan(1) // not one endless row
    for (let i = 1; i < ids.length; i++) {
      const a = box(ids[i - 1] as string)
      const b = box(ids[i] as string)
      // The next section is to the right in the same row, or starts a lower row.
      expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true)
    }
  })

  it('keeps a page-like shape', () => {
    expect(L.width / L.height).toBeGreaterThan(0.8)
    expect(L.width / L.height).toBeLessThan(4)
  })

  it('gives the boxes of one row the same bottom, without overlaps', () => {
    const regions = L.regions.filter((r) => r.kind === 'section')
    const byTop = new Map<number, number[]>()
    for (const r of regions) byTop.set(r.y, [...(byTop.get(r.y) ?? []), r.y + r.h])
    for (const bottoms of byTop.values()) expect(new Set(bottoms).size).toBe(1)
    for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i] as (typeof regions)[number]
        const b = regions[j] as (typeof regions)[number]
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(
          true,
        )
      }
  })

  it('makes each section heading a bar across its box', () => {
    for (const id of ids) {
      const heading = box(id)
      const region = L.regions.find((r) => r.sectionId === id)
      expect(heading.h).toBe(SIZES.sectionH)
      expect(heading.w).toBe((region?.w ?? 0) - SIZES.regionPad * 2)
    }
  })

  it('runs the title line along gutters and a spine, never through a box', () => {
    const first = L.bus[ids[0] as string]
    expect(first?.spineX).toBeNull()
    expect(first?.y).toBe(first?.top)
    const lowerRow = ids.filter((id) => box(id).y > box(ids[0] as string).y)
    expect(lowerRow.length).toBeGreaterThan(0)
    const regions = L.regions.filter((r) => r.kind === 'section')
    const leftmost = Math.min(...regions.map((r) => r.x))
    for (const id of lowerRow) {
      const line = L.bus[id]
      expect(line?.spineX).toBeLessThan(leftmost) // the spine passes left of every box
      // Its gutter lies between rows: inside no box.
      for (const r of regions) expect(line && line.y > r.y && line.y < r.y + r.h).toBe(false)
      expect(line?.y).toBeLessThan(box(id).y)
    }
    // The first gutter is between the title and the first row.
    expect(first?.top).toBeGreaterThan(SIZES.rootH)
    expect(first?.top).toBeLessThan(Math.min(...regions.map((r) => r.y)))
  })
})

describe('a small map', () => {
  it('stays in one row when it fits', () => {
    const { nodes, ids } = notesMap(2, [2, 2])
    const L = computeLayout(nodes)
    expect(new Set(ids.map((id) => L.boxes[id]?.y)).size).toBe(1)
  })
})
