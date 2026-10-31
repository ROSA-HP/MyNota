import { useCallback } from 'react'
import { useAiKey } from '@/features/settings/aiKeyStore'
import { useBuild, type BuildJob } from './buildStore'
import { chapterProgress } from './canvas/zoom'
import { useWorkspace } from './workspaceStore'

/** Builds (or continues) chapters from the map, with the map's language and default options. */
export function useChapterBuilder() {
  const key = useAiKey((s) => s.key)
  const enqueue = useBuild((s) => s.enqueue)
  const build = useCallback(
    (chapterIds: string[]) => {
      const ws = useWorkspace.getState()
      if (!key || !ws.map) return false
      const map = ws.map
      const lang = map.languages[0] ?? null
      const jobs: BuildJob[] = chapterIds.flatMap((id) => {
        const chapter = ws.nodes[id]
        const source = ws.sources.find((s) => s.chapter_node_id === id)
        if (!chapter || !source?.paragraphs.length) return []
        const progress = chapterProgress(id, ws.nodes, true)
        if (progress === 'built') return []
        return [
          {
            mapId: map.id,
            rootId: id,
            title: chapter.title,
            paragraphs: source.paragraphs.map((p) => ({ n: p.n, text: p.text })),
            sourceLanguage: lang,
            explanationLanguage: lang,
            detailLevel: 'standard' as const,
            bookTitle: map.type === 'book' ? map.title : undefined,
            resume: progress === 'partial',
          },
        ]
      })
      if (!jobs.length) return false
      enqueue(jobs, key)
      return true
    },
    [key, enqueue],
  )
  return { build, canBuild: Boolean(key) }
}

export { chapterProgress, type ChapterProgress } from './canvas/zoom'
