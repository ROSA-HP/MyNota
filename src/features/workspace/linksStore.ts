import { create } from 'zustand'
import { AiError, isAbortError, type AiErrorKind } from '@/ai/errors'
import { finishJob, startJob } from '@/ai/jobs'
import { toProviderSchema } from '@/ai/jsonSchema'
import {
  canLink,
  linkCandidates,
  maxLinksFor,
  toSuggestions,
  type LinkScope,
} from '@/ai/pipeline/links'
import { LINKS_PROMPT_VERSION, linksPrompt } from '@/ai/prompts/links.v1'
import { SYSTEM_PROMPT } from '@/ai/prompts/shared'
import { createAdapter } from '@/ai/providers'
import { AiQueue } from '@/ai/queue'
import { LinksResponseSchema } from '@/ai/schemas/links'
import { generateStructured } from '@/ai/structured'
import type { ActiveKey } from '@/features/settings/aiKeyStore'
import { findRoot } from './canvas/layout'
import { useWorkspace } from './workspaceStore'

export type LinksStatus =
  | { state: 'idle' }
  | { state: 'running'; scope: LinkScope['kind'] }
  | { state: 'waiting'; scope: LinkScope['kind']; until: number }
  | { state: 'done'; scope: LinkScope['kind']; found: number; chapters: number[] | null }
  | { state: 'failed'; scope: LinkScope['kind']; kind: AiErrorKind }

interface LinksState {
  status: LinksStatus
  /** The "found N links" note was closed (or the tray opened). */
  noticeSeen: boolean
  /** Finds links for one chapter (or a notes map) or across the whole book. Resolves with the
   *  number of new suggestions; never throws. */
  run: (scope: LinkScope, key: ActiveKey) => Promise<number>
  stop: () => void
  seen: () => void
  reset: () => void
}

let controller: AbortController | null = null

/** Chapter numbers (1-based, in book order) that the suggestions touch, for the notice. */
function chapterNumbers(ids: string[]): number[] | null {
  const { nodes } = useWorkspace.getState()
  const root = findRoot(Object.values(nodes))
  if (root?.level !== 'book') return null
  const chapters = Object.values(nodes)
    .filter((n) => n.parent_id === root.id)
    .sort((a, b) => a.sort_order - b.sort_order)
  const chapterOf = (id: string): string | null => {
    let cur = nodes[id]
    while (cur?.parent_id && cur.parent_id !== root.id) cur = nodes[cur.parent_id]
    return cur?.parent_id === root.id ? cur.id : null
  }
  const nums = new Set<number>()
  for (const id of ids) {
    const ch = chapterOf(id)
    const i = chapters.findIndex((c) => c.id === ch)
    if (i >= 0) nums.add(i + 1)
  }
  return [...nums].sort((a, b) => a - b)
}

export const useLinks = create<LinksState>((set) => ({
  status: { state: 'idle' },
  noticeSeen: true,

  run: async (scope, key) => {
    const ws = useWorkspace.getState()
    const map = ws.map
    const root = findRoot(Object.values(ws.nodes))
    if (!map || !root || !ws.canEdit()) return 0
    const candidates = linkCandidates(ws.nodes, root.id, scope)
    if (!canLink(candidates)) return 0
    controller?.abort()
    const ctrl = new AbortController()
    controller = ctrl
    const max = maxLinksFor(scope.kind, candidates.blocks.length, candidates.groups)
    const adapter = createAdapter(key)
    set({ status: { state: 'running', scope: scope.kind } })
    const startedAt = performance.now()
    const jobId = await startJob({
      map_id: map.id,
      pass: 'links',
      provider: adapter.provider,
      model: adapter.model,
      prompt_version: LINKS_PROMPT_VERSION,
      chapter_node_id: scope.kind === 'chapter' ? scope.chapterId : root.id,
    })
    const queue = new AiQueue({
      concurrency: 1,
      onStart: () => set({ status: { state: 'running', scope: scope.kind } }),
      onWait: (_, until) => set({ status: { state: 'waiting', scope: scope.kind, until } }),
    })
    try {
      const result = await queue.run(
        'links',
        () =>
          generateStructured({
            adapter,
            system: SYSTEM_PROMPT,
            prompt: linksPrompt({
              scope: scope.kind,
              title: candidates.title,
              language: map.languages[0] ?? root.lang,
              maxLinks: max,
              blocks: candidates.blocks,
            }),
            schema: LinksResponseSchema,
            jsonSchema: toProviderSchema(LinksResponseSchema),
            signal: ctrl.signal,
          }),
        ctrl.signal,
      )
      void finishJob(jobId, {
        status: 'done',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: performance.now() - startedAt,
      })
      // The map may have changed while waiting: re-read existing links before adding.
      const now = useWorkspace.getState()
      const suggestions = toSuggestions(result.data, {
        mapId: map.id,
        candidates,
        existing: Object.values(now.relations),
        max,
      }).filter((r) => now.nodes[r.from_node] && now.nodes[r.to_node])
      if (suggestions.length) now.addRelations(suggestions, { saveNow: true })
      set({
        status: {
          state: 'done',
          scope: scope.kind,
          found: suggestions.length,
          chapters: chapterNumbers(suggestions.flatMap((r) => [r.from_node, r.to_node])),
        },
        noticeSeen: suggestions.length === 0,
      })
      return suggestions.length
    } catch (e) {
      const kind: AiErrorKind =
        e instanceof AiError ? e.kind : isAbortError(e) ? 'aborted' : 'unknown'
      void finishJob(jobId, {
        status: 'failed',
        durationMs: performance.now() - startedAt,
        error: e instanceof Error ? e.message : String(e),
      })
      set({
        status:
          kind === 'aborted' ? { state: 'idle' } : { state: 'failed', scope: scope.kind, kind },
      })
      return 0
    } finally {
      if (controller === ctrl) controller = null
    }
  },

  stop: () => {
    controller?.abort()
    controller = null
  },

  seen: () => set({ noticeSeen: true }),

  reset: () => {
    controller?.abort()
    controller = null
    set({ status: { state: 'idle' }, noticeSeen: true })
  },
}))
