import type { NodeRow, RelationRow, SourceParagraph } from '@/lib/database.types'
import {
  PALETTE,
  blockNodes,
  dirFor,
  makeNode,
  newId,
  sectionNodes,
} from '../src/ai/pipeline/convert'
import { maxLinksFor, toSuggestions, type LinkCandidates } from '../src/ai/pipeline/links'
import type { Paragraph } from '../src/ai/prompts/shared'
import { finalSection, withoutHeadings } from './check'
import type { CrossLink, Draft, DraftChapter } from './draft'

/**
 * Turns a finished draft into rows for `admin_import_map`, with the app's own converters, so an
 * admin map is stored exactly like a map built in the browser. No positions: the app does the
 * layout when the map is opened, as it does for every map.
 */

export interface PublishPart {
  nodes: Array<Partial<NodeRow>>
  relations: Array<Partial<RelationRow>>
  sources: Array<{
    id: string
    chapter_node_id: string
    kind: 'pdf' | 'text'
    pages: number | null
    paragraphs: SourceParagraph[]
    file_name: string | null
    file_size: number | null
    file_hash: string | null
  }>
}

export interface PublishPlan {
  mapId: string
  title: string
  type: Draft['mapType']
  languages: string[]
  parts: PublishPart[]
  /** Parts already in the database, so a lost connection can pick up where it stopped. */
  done: number
  stats: {
    chapters: number
    sections: number
    blocks: number
    relations: number
    suggested: number
  }
}

/** Only what the database function reads; created_by and map_id are set there. */
function nodeRow(n: NodeRow): Partial<NodeRow> {
  return {
    id: n.id,
    parent_id: n.parent_id,
    sort_order: n.sort_order,
    level: n.level,
    title: n.title,
    summary: n.summary,
    type: n.type,
    color: n.color,
    importance: n.importance,
    details: n.details,
    lang: n.lang,
    dir: n.dir,
    branch_view: n.branch_view,
    collapsed: n.collapsed,
    source: n.source,
    ai_added: n.ai_added,
    ai_added_reason: n.ai_added_reason,
    origin: n.origin,
  }
}

function relationRow(r: RelationRow): Partial<RelationRow> {
  return {
    id: r.id,
    from_node: r.from_node,
    to_node: r.to_node,
    type: r.type,
    label: r.label,
    direction: r.direction,
    status: r.status,
    confidence: r.confidence,
    origin: r.origin,
  }
}

/** A block's name in `list_blocks` and `save_links`: chapter.section.key, such as 2.1.b3. */
export const blockRef = (chapter: number, section: number, key: string): string =>
  `${chapter}.${section}.${key}`

/** The paragraphs of one section of a chapter (1-based). */
export function sectionParagraphs(chapter: DraftChapter, section: number): Paragraph[] {
  const range = chapter.outline?.sections[section - 1]?.paragraphs
  if (!range) return []
  return chapter.paragraphs.filter((p) => p.n >= range.from && p.n <= range.to)
}

/** A section's paragraphs as the checks and nets see them: without headings the map has. */
export function sectionBody(draft: Draft, chapter: DraftChapter, section: number): Paragraph[] {
  const s = chapter.outline?.sections[section - 1]
  const titles = [
    draft.title,
    chapter.title,
    s?.title ?? '',
    ...(s?.subsections.map((x) => x.title) ?? []),
  ]
  return withoutHeadings(sectionParagraphs(chapter, section), titles)
}

/** The chapters that go into the map: real chapters, and any other part that was mapped. */
export const includedChapters = (draft: Draft): DraftChapter[] =>
  draft.chapters.filter((c) => c.kind === 'chapter' || c.outline)

const titleOf = (c: DraftChapter, i: number) => c.title.trim().slice(0, 200) || `${i + 1}`

function suggestions(
  links: CrossLink[],
  ctx: {
    mapId: string
    idOf: Map<string, string>
    groupOf: Map<string, string>
    existing: RelationRow[]
    max: number
  },
): RelationRow[] {
  const idMap = new Map([...ctx.idOf].map(([ref, id]) => [ref.toUpperCase(), id]))
  const candidates: LinkCandidates = {
    title: '',
    blocks: [],
    idMap,
    groupOf: ctx.groupOf,
    groups: new Set(ctx.groupOf.values()).size,
  }
  return toSuggestions(
    { links },
    { mapId: ctx.mapId, candidates, existing: ctx.existing, max: ctx.max },
  )
}

export function buildPlan(draft: Draft): PublishPlan {
  const mapId = newId()
  const lang = draft.language
  const dir = dirFor(lang)
  const chapters = includedChapters(draft)
  const book = draft.mapType === 'book'

  const root = book
    ? makeNode({
        map_id: mapId,
        level: 'book',
        title: draft.title.slice(0, 200),
        lang,
        dir,
        importance: 'core',
      })
    : null
  const chapterRows = chapters.map((c, i) =>
    makeNode({
      map_id: mapId,
      parent_id: root?.id ?? null,
      sort_order: i,
      level: 'chapter',
      title: book ? titleOf(c, i) : draft.title.slice(0, 200),
      color: book ? (PALETTE[i % PALETTE.length] ?? 'yellow') : null,
      lang,
      dir,
      importance: 'core',
    }),
  )

  const parts: PublishPart[] = [
    { nodes: [...(root ? [root] : []), ...chapterRows].map(nodeRow), relations: [], sources: [] },
  ]
  const stats = { chapters: chapters.length, sections: 0, blocks: 0, relations: 0, suggested: 0 }
  const everyId = new Map<string, string>()
  const chapterOfBlock = new Map<string, string>()
  const everyRelation: RelationRow[] = []

  chapters.forEach((chapter, i) => {
    const row = chapterRows[i]
    if (!row) return
    const number = draft.chapters.indexOf(chapter) + 1
    const nodes: NodeRow[] = []
    const relations: RelationRow[] = []
    const idOf = new Map<string, string>()
    const groupOf = new Map<string, string>()
    let blocks = 0

    if (chapter.outline) {
      const sections = sectionNodes(chapter.outline, { mapId, lang, rootId: row.id })
      nodes.push(...sections)
      stats.sections += sections.length
      sections.forEach((section, s) => {
        const saved = chapter.sections[s]
        if (!saved) return
        const data = finalSection(saved.answer, sectionBody(draft, chapter, s + 1))
        const built = blockNodes(data, { mapId, section, lang })
        // Sub-cards start folded: a new map first shows the main ideas, as in the app.
        const parents = new Set(built.nodes.map((n) => n.parent_id))
        nodes.push(...built.nodes.map((n) => (parents.has(n.id) ? { ...n, collapsed: true } : n)))
        relations.push(...built.relations)
        blocks += built.nodes.length
        for (const [key, id] of built.ids) {
          const ref = blockRef(number, s + 1, key)
          idOf.set(ref, id)
          groupOf.set(id, section.id)
          everyId.set(ref, id)
          chapterOfBlock.set(id, row.id)
        }
      })
    }

    const linked = suggestions(chapter.links, {
      mapId,
      idOf,
      groupOf,
      existing: relations,
      max: maxLinksFor('chapter', blocks, new Set(groupOf.values()).size),
    })
    relations.push(...linked)
    everyRelation.push(...relations)
    stats.blocks += blocks
    stats.suggested += linked.length

    parts.push({
      nodes: nodes.map(nodeRow),
      relations: relations.map(relationRow),
      sources: [
        {
          id: newId(),
          chapter_node_id: row.id,
          kind: draft.source.kind,
          pages:
            chapter.firstPage && chapter.lastPage ? chapter.lastPage - chapter.firstPage + 1 : null,
          paragraphs: chapter.paragraphs,
          file_name: draft.source.file?.name ?? null,
          file_size: draft.source.file?.size ?? null,
          file_hash: draft.source.file?.hash ?? null,
        },
      ],
    })
  })

  if (book && draft.bookLinks.length) {
    const linked = suggestions(draft.bookLinks, {
      mapId,
      idOf: everyId,
      groupOf: chapterOfBlock,
      existing: everyRelation,
      max: maxLinksFor('book', everyId.size, chapters.length),
    })
    stats.suggested += linked.length
    parts.push({ nodes: [], relations: linked.map(relationRow), sources: [] })
    everyRelation.push(...linked)
  }

  stats.relations = everyRelation.length - stats.suggested
  return {
    mapId,
    title: draft.title.slice(0, 200),
    type: draft.mapType,
    languages: lang ? [lang] : [],
    parts,
    done: 0,
    stats,
  }
}
