import { useMemo } from 'react'
import type { NodeRow, SourceRow } from '@/lib/database.types'
import { findRoot } from '../canvas/layout'
import { useWorkspace } from '../workspaceStore'

/**
 * The source paragraphs a node cites, and the original files (PDF or photos) with the pages it
 * cites in each. Paragraph numbers restart in every book chapter, so the chapter's sources are
 * read (or the map's, for notes maps); merged notes are extra sources of the same chapter.
 */
export function useNodeSource(node: NodeRow) {
  const nodes = useWorkspace((s) => s.nodes)
  const sources = useWorkspace((s) => s.sources)
  const chapterSources = useMemo(() => {
    const root = findRoot(Object.values(nodes))
    let cur: NodeRow | undefined = node
    if (root?.level === 'book')
      while (cur?.parent_id && cur.parent_id !== root.id) cur = nodes[cur.parent_id]
    const chapterId = root?.level === 'book' ? cur?.id : root?.id
    const mine = sources.filter((src) => src.chapter_node_id === chapterId)
    return mine.length ? mine : sources.filter((src) => src.chapter_node_id === null)
  }, [nodes, node, sources])
  const paragraphs = chapterSources
    .flatMap((src) => src.paragraphs ?? [])
    .filter((p) => node.source.paragraphs.includes(p.n))
  const pageSources: Array<{ src: SourceRow; pages: number[] }> = chapterSources.flatMap((src) => {
    if (!src.file_hash) return []
    const pages = [
      ...new Set(
        (src.paragraphs ?? [])
          .filter((p) => node.source.paragraphs.includes(p.n) && typeof p.page === 'number')
          .map((p) => p.page as number),
      ),
    ].sort((a, b) => a - b)
    return pages.length ? [{ src, pages }] : []
  })
  return { paragraphs, pageSources }
}
