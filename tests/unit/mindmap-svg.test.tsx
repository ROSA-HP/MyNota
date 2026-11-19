import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
  MIN_MAP_FONT_PT,
  VectorMapSvg,
  buildVectorMindMapPages,
  wrapMapNodeTitle,
} from '@/features/export/mindmapSvg'
import type { NodeRow, RelationRow } from '@/lib/database.types'

function makeNode(
  id: string,
  parent_id: string | null,
  level: NodeRow['level'],
  title: string,
  sort_order = 0,
  extra: Partial<NodeRow> = {},
): NodeRow {
  return {
    id,
    map_id: 'm1',
    parent_id,
    level,
    title,
    summary: 'Should NOT appear on the vector mind map canvas',
    type: level === 'block' ? 'formula' : null,
    icon: null,
    importance: sort_order === 0 ? 'core' : 'supporting',
    color: 'sky',
    lang: 'en',
    dir: 'ltr',
    branch_view: 'tree',
    ai_added: false,
    ai_added_reason: null,
    sort_order,
    position: { x: 0, y: 0 },
    size: { w: 200, h: 80 },
    collapsed: false,
    source: { paragraphs: [1] },
    origin: 'user',
    created_by: null,
    details: [
      { kind: 'text', text: 'Formula details should stay off the mind map' },
      { kind: 'formula', latex: '\\vec{S} = \\frac{1}{\\mu_0}\\vec{E}\\times\\vec{B}' },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

describe('Horizontal Vector SVG Mind Map', () => {
  it('wraps long node titles onto multiple lines cleanly without truncating with ellipsis', () => {
    const wrapped = wrapMapNodeTitle(
      'Transverse Electromagnetic Wave Propagation and Energy Transport Mechanisms',
      26,
    )
    expect(wrapped.lines.length).toBeGreaterThanOrEqual(2)
    expect(wrapped.lines.join(' ')).not.toContain('...')
    expect(wrapped.lines.join(' ')).not.toContain('…')
  })

  it('lays out Root -> Sections -> Blocks strictly left-to-right (LR) with title-only vector SVG', () => {
    const nodes: Record<string, NodeRow> = {
      root: makeNode('root', null, 'book', 'Electromagnetic Waves', 0),
      s1: makeNode('s1', 'root', 'section', 'Wave Equations', 0),
      s2: makeNode('s2', 'root', 'section', 'Polarization', 1),
      b1: makeNode('b1', 's1', 'block', 'Poynting Vector', 0),
      b2: makeNode('b2', 's2', 'block', "Brewster's Angle", 0),
    }
    const relations: Record<string, RelationRow> = {
      r1: {
        id: 'r1',
        map_id: 'm1',
        from_node: 'b1',
        to_node: 'b2',
        type: 'causes',
        label: 'determines flux',
        direction: 'forward',
        status: 'accepted',
        confidence: null,
        origin: 'user',
        created_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    }

    const pages = buildVectorMindMapPages({
      nodes,
      relations,
      rootId: 'root',
      title: 'Electromagnetic Waves',
      slotSizePx: { w: 1000, h: 640 },
      light: true,
      links: true,
      relationLabel: (r) => r.label || r.type,
    })

    expect(pages).toHaveLength(1)
    const model = pages[0]!.model
    const byId = new Map(model.nodes.map((n) => [n.id, n]))
    // Horizontal LR progression
    expect(byId.get('root')!.x).toBeLessThan(byId.get('s1')!.x)
    expect(byId.get('s1')!.x).toBeLessThan(byId.get('b1')!.x)
    expect(model.minRenderedFontPt).toBeGreaterThanOrEqual(MIN_MAP_FONT_PT)

    // Render SVG and verify no descriptions/formulas leak into SVG, and embedded fonts + pills render
    const { container } = render(<VectorMapSvg model={model} width="100%" height="100%" />)
    const svg = container.querySelector('svg[data-vector-map="true"]')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('defs style')?.textContent).toContain('Space Grotesk')
    expect(container.textContent).not.toContain('Should NOT appear')
    expect(container.textContent).not.toContain('Formula details should stay off')
    expect(container.querySelector('[data-svg-rel-pill="r1"]')).not.toBeNull()

    // Collision check: relation pill must not overlap any node box
    const pill = model.relationEdges[0]!
    for (const n of model.nodes) {
      const overlaps = !(
        pill.labelX + pill.labelW <= n.x ||
        n.x + n.w <= pill.labelX ||
        pill.labelY + pill.labelH <= n.y ||
        n.y + n.h <= pill.labelY
      )
      expect(overlaps).toBe(false)
    }
  })

  it('splits dense maps into an Overview page plus chunked landscape detail pages to stay >= 7pt', () => {
    const nodes: Record<string, NodeRow> = {
      root: makeNode('root', null, 'book', 'Physics Compendium', 0),
    }
    // 8 sections x 7 children each = 57 nodes -> vertical span too tall for >= 7pt on one page
    for (let s = 1; s <= 8; s++) {
      const secId = `sec-${s}`
      nodes[secId] = makeNode(secId, 'root', 'section', `Section ${s}: Topic`, s - 1)
      for (let b = 1; b <= 7; b++) {
        const bId = `b-${s}-${b}`
        nodes[bId] = makeNode(bId, secId, 'block', `Block ${s}.${b} Concept Title`, b - 1)
      }
    }

    const pages = buildVectorMindMapPages({
      nodes,
      relations: {},
      rootId: 'root',
      title: 'Physics Compendium',
      slotSizePx: { w: 1000, h: 630 },
      light: true,
      links: true,
      relationLabel: (r) => r.type,
    })

    expect(pages.length).toBeGreaterThan(2)
    expect(pages[0]!.isOverview).toBe(true)
    expect(pages[0]!.model.nodes.length).toBe(9) // Root + 8 sections only
    expect(pages[0]!.model.minRenderedFontPt).toBeGreaterThanOrEqual(MIN_MAP_FONT_PT)
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i]!.isOverview).toBe(false)
      expect(pages[i]!.model.minRenderedFontPt).toBeGreaterThanOrEqual(MIN_MAP_FONT_PT)
    }
  })
})
