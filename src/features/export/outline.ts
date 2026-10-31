import type { CardRow, DetailBlock, NodeRow, RelationRow } from '@/lib/database.types'

/** One line of the exported outline (PDF pages and Markdown share it). */
export interface OutlineItem {
  id: string
  depth: number
  level: NodeRow['level']
  title: string
  summary: string
  details: string[]
  /** "→ label: Other block" lines (both directions). */
  links: Array<{ label: string; other: string; outgoing: boolean }>
  cards: Array<{ front: string; back: string }>
}

export interface OutlineOptions {
  details: boolean
  links: boolean
  cards: boolean
}

/** A detail line as readable text (formulas keep their LaTeX between $ signs). */
export function detailLine(d: DetailBlock): string {
  switch (d.kind) {
    case 'text':
    case 'bullet':
      return d.text
    case 'example':
      return d.translation ? `${d.text} (${d.translation})` : d.text
    case 'cloze':
      return d.text.replace(/\{\{(.+?)(::[^}]*)?\}\}/g, '$1')
    case 'vocab':
      return [
        [d.article, d.term].filter(Boolean).join(' '),
        d.plural && `(${d.plural})`,
        d.meaning && `— ${d.meaning}`,
      ]
        .filter(Boolean)
        .join(' ')
    case 'formula':
      return `$${d.latex}$${d.variables ? ` — ${d.variables}` : ''}`
    case 'question':
      return `${d.front} → ${d.back}`
  }
}

/**
 * The map (or one chapter/section of it) in outline order. `relationLabel` turns a relation
 * into its words (the student's label, or the type's name in the UI language).
 */
export function outlineItems(input: {
  nodes: Record<string, NodeRow>
  relations: Record<string, RelationRow>
  cards: CardRow[]
  rootId: string
  options: OutlineOptions
  relationLabel: (r: RelationRow) => string
}): OutlineItem[] {
  const { nodes, options } = input
  const kids = new Map<string, NodeRow[]>()
  for (const n of Object.values(nodes)) {
    if (!n.parent_id) continue
    kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n])
  }
  for (const list of kids.values())
    list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  const accepted = Object.values(input.relations).filter((r) => r.status === 'accepted')
  const cardsBy = new Map<string, CardRow[]>()
  for (const c of input.cards) {
    if (!c.node_id || c.suspended) continue
    cardsBy.set(c.node_id, [...(cardsBy.get(c.node_id) ?? []), c])
  }

  const out: OutlineItem[] = []
  const walk = (n: NodeRow, depth: number) => {
    out.push({
      id: n.id,
      depth,
      level: n.level,
      title: n.title,
      summary: options.details ? n.summary : '',
      details: options.details ? n.details.map(detailLine).filter(Boolean) : [],
      links: options.links
        ? accepted
            .filter((r) => r.from_node === n.id || r.to_node === n.id)
            .map((r) => {
              const outgoing = r.from_node === n.id
              return {
                label: input.relationLabel(r),
                other: nodes[outgoing ? r.to_node : r.from_node]?.title ?? '',
                outgoing,
              }
            })
            .filter((l) => l.other)
        : [],
      cards: options.cards
        ? (cardsBy.get(n.id) ?? []).map((c) => ({
            front: c.type === 'cloze' ? c.front.replace(/\{\{(.+?)\}\}/g, '[…]') : c.front,
            back:
              c.type === 'cloze'
                ? [
                    c.front
                      .match(/\{\{(.+?)\}\}/g)
                      ?.map((m) => m.slice(2, -2))
                      .join(', '),
                    c.back,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : c.back,
          }))
        : [],
    })
    for (const k of kids.get(n.id) ?? []) walk(k, depth + 1)
  }
  const root = nodes[input.rootId]
  if (root) walk(root, 0)
  return out
}

/** Markdown escaping for text that came from the model or the student. */
const md = (s: string) => s.replace(/([\\`*_[\]#<>|])/g, '\\$1').replace(/\n+/g, ' ')

/** The outline as Markdown (Obsidian-friendly): headings down to sections, blocks as lists. */
export function toMarkdown(
  items: OutlineItem[],
  labels: { cards: string; source: string },
): string {
  const lines: string[] = []
  const sectionDepth = items.find((i) => i.level === 'section')?.depth ?? 1
  for (const it of items) {
    const heading = it.level !== 'block' && it.depth <= sectionDepth
    if (heading) {
      lines.push('', `${'#'.repeat(Math.min(6, it.depth + 1))} ${md(it.title)}`)
      if (it.summary) lines.push('', md(it.summary))
      for (const d of it.details) lines.push(`- ${md(d)}`)
    } else {
      const pad = '  '.repeat(Math.max(0, it.depth - sectionDepth - 1))
      lines.push(`${pad}- **${md(it.title)}**${it.summary ? ` — ${md(it.summary)}` : ''}`)
      for (const d of it.details) lines.push(`${pad}  - ${md(d)}`)
    }
    const pad = heading ? '' : `${'  '.repeat(Math.max(0, it.depth - sectionDepth - 1))}  `
    for (const l of it.links)
      lines.push(`${pad}- ${l.outgoing ? '→' : '←'} ${md(l.label)}: ${md(l.other)}`)
    if (it.cards.length) {
      lines.push(`${pad}- ${labels.cards}`)
      for (const c of it.cards) lines.push(`${pad}  - ${md(c.front)} :: ${md(c.back)}`)
    }
  }
  return `${lines.join('\n').trim()}\n\n---\n${labels.source}\n`
}
