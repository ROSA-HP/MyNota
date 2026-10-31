import { describe, expect, it } from 'vitest'
import { makeNode } from '@/ai/pipeline/convert'
import { fileName } from '@/features/export/capture'
import { detailLine, outlineItems, toMarkdown } from '@/features/export/outline'
import type { CardRow, NodeRow, RelationRow } from '@/lib/database.types'

const n = (
  id: string,
  parent: string | null,
  level: NodeRow['level'],
  extra: Partial<NodeRow> = {},
) => makeNode({ id, map_id: 'm', parent_id: parent, level, title: id, ...extra })

const nodes = Object.fromEntries(
  [
    n('Cells', null, 'book'),
    n('Membrane', 'Cells', 'section', { summary: 'The cell border', sort_order: 0 }),
    n('Osmosis', 'Membrane', 'block', {
      summary: 'Water *moves*',
      details: [
        { kind: 'bullet', text: 'through [aquaporins]' },
        { kind: 'cloze', text: 'Moves {{water}}' },
        { kind: 'formula', latex: 'J=-D', variables: 'flux' },
        { kind: 'vocab', term: 'Zelle', article: 'die', plural: 'Zellen', meaning: 'cell' },
      ],
    }),
    n('Diffusion', 'Membrane', 'block', { sort_order: 1 }),
  ].map((x) => [x.id, x]),
)
const rel = {
  id: 'r',
  map_id: 'm',
  from_node: 'Osmosis',
  to_node: 'Diffusion',
  type: 'example_of',
  label: '',
  status: 'accepted',
} as RelationRow
const card = {
  id: 'c',
  node_id: 'Osmosis',
  type: 'cloze',
  front: 'Osmosis moves {{water}}.',
  back: '',
  suspended: false,
} as CardRow

describe('export', () => {
  it('turns details into readable lines', () => {
    expect(detailLine({ kind: 'cloze', text: 'Moves {{water::hint}} fast' })).toBe(
      'Moves water fast',
    )
    expect(
      detailLine({
        kind: 'vocab',
        term: 'Zelle',
        article: 'die',
        plural: 'Zellen',
        meaning: 'cell',
      }),
    ).toBe('die Zelle (Zellen) — cell')
    expect(detailLine({ kind: 'question', front: 'Q', back: 'A' })).toBe('Q → A')
  })

  it('writes the outline as Markdown with links and cards, escaping model text', () => {
    const items = outlineItems({
      nodes,
      relations: { r: rel },
      cards: [card],
      rootId: 'Cells',
      options: { details: true, links: true, cards: true },
      relationLabel: (r) => r.type.replace('_', ' '),
    })
    expect(items.map((i) => [i.depth, i.title])).toEqual([
      [0, 'Cells'],
      [1, 'Membrane'],
      [2, 'Osmosis'],
      [2, 'Diffusion'],
    ])
    const text = toMarkdown(items, { cards: 'Flashcards', source: 'Exported' })
    expect(text).toContain('# Cells')
    expect(text).toContain('## Membrane\n\nThe cell border')
    expect(text).toContain('- **Osmosis** — Water \\*moves\\*')
    expect(text).toContain('  - through \\[aquaporins\\]')
    expect(text).toContain('  - $J=-D$ — flux')
    expect(text).toContain('  - → example of: Diffusion')
    expect(text).toContain('  - Osmosis moves \\[…\\]. :: water')
    expect(text).toContain('- **Diffusion**')
    expect(text).toContain('  - ← example of: Osmosis')
    expect(text.trimEnd().endsWith('Exported')).toBe(true)
  })

  it('leaves out what the options turn off and exports one part', () => {
    const items = outlineItems({
      nodes,
      relations: { r: rel },
      cards: [card],
      rootId: 'Membrane',
      options: { details: false, links: false, cards: false },
      relationLabel: () => '',
    })
    expect(items.map((i) => i.title)).toEqual(['Membrane', 'Osmosis', 'Diffusion'])
    expect(
      items.every((i) => !i.summary && !i.details.length && !i.links.length && !i.cards.length),
    ).toBe(true)
  })

  it('makes safe file names in any script', () => {
    expect(fileName('Cells: 1/2 "intro"', 'pdf')).toBe('Cells 1 2 intro.pdf')
    expect(fileName('علم الأحياء', 'md')).toBe('علم الأحياء.md')
    expect(fileName('  ', 'png')).toBe('MyNota.png')
  })
})
