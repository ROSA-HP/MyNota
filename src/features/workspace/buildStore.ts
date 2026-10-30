import { create } from 'zustand'
import { AiError, isAbortError, type AiErrorKind } from '@/ai/errors'
import { finishJob, startJob } from '@/ai/jobs'
import { toProviderSchema } from '@/ai/jsonSchema'
import { blockNodes, outlineText, sectionNodes } from '@/ai/pipeline/convert'
import { DETAILS_PROMPT_VERSION, detailsPrompt } from '@/ai/prompts/details.v1'
import { OUTLINE_PROMPT_VERSION, outlinePrompt } from '@/ai/prompts/outline.v1'
import { SYSTEM_PROMPT, type Paragraph } from '@/ai/prompts/shared'
import { createAdapter } from '@/ai/providers'
import { AiQueue } from '@/ai/queue'
import { DetailsResponseSchema, detailsSchemaFor } from '@/ai/schemas/details'
import { checkDetailsRules, checkOutlineRules } from '@/ai/schemas/rules'
import {
  OutlineResponseSchema,
  normalizeOutline,
  outlineSchemaFor,
  type OutlineResponse,
} from '@/ai/schemas/outline'
import { generateStructured } from '@/ai/structured'
import type { ProviderAdapter } from '@/ai/types'
import type { ActiveKey } from '@/features/settings/aiKeyStore'
import { useWorkspace } from './workspaceStore'
import type { AiProvider } from '@/lib/database.types'

export type SectionStatus =
  | { state: 'queued' }
  | { state: 'running' }
  | { state: 'waiting'; until: number }
  | { state: 'done' }
  | { state: 'failed'; kind: AiErrorKind }

export interface BuildOptions {
  mapId: string
  rootId: string
  title: string
  paragraphs: Paragraph[]
  sourceLanguage: string | null
  explanationLanguage: string | null
  detailLevel: 'brief' | 'standard' | 'detailed'
  /** Book maps: the book's title for the prompts (each chapter is built under its own node). */
  bookTitle?: string
}

export type ChapterBuildState = 'queued' | 'running' | 'done' | 'failed' | 'stopped'

interface BuildState {
  mapId: string | null
  /** Provider of the running build, so retries use the same key. */
  provider: AiProvider | null
  phase: 'idle' | 'outline' | 'details' | 'done' | 'failed' | 'stopped'
  outlineStatus: SectionStatus
  /** sectionNodeId → status */
  sections: Record<string, SectionStatus>
  order: string[]
  failure: AiErrorKind | null
  /** Book builds: chapters run one after another; each chapter's sections run in parallel. */
  chapters: Record<string, ChapterBuildState>
  chapterOrder: string[]
  currentChapter: string | null
  start: (opts: BuildOptions, key: ActiveKey) => Promise<void>
  startBook: (jobs: BuildOptions[], key: ActiveKey) => Promise<void>
  retrySection: (sectionId: string, key: ActiveKey) => Promise<void>
  retryOutline: (key: ActiveKey) => Promise<void>
  stop: () => void
  clear: () => void
}

// Run context outside React state (abort controller, outline, options).
let controller: AbortController | null = null
/** Set by stop(): the book queue does not start further chapters. */
let bookStopped = false
let ctx: {
  opts: BuildOptions
  outline: OutlineResponse | null
  sectionRanges: Record<string, { from: number; to: number; title: string; shape: string }>
} | null = null

/** Free keys allow few parallel requests; two sections at a time keeps the map growing steadily. */
const CONCURRENCY = 2

function adapterFor(key: ActiveKey): ProviderAdapter {
  return createAdapter(key)
}

const kindOf = (e: unknown): AiErrorKind =>
  e instanceof AiError ? e.kind : isAbortError(e) ? 'aborted' : 'unknown'

export const useBuild = create<BuildState>((set, get) => {
  const setSection = (id: string, status: SectionStatus) =>
    set({ sections: { ...get().sections, [id]: status } })

  function makeQueue() {
    return new AiQueue({
      concurrency: CONCURRENCY,
      onStart: (id) =>
        id === 'outline'
          ? set({ outlineStatus: { state: 'running' } })
          : setSection(id, { state: 'running' }),
      onWait: (id, until) =>
        id === 'outline'
          ? set({ outlineStatus: { state: 'waiting', until } })
          : setSection(id, { state: 'waiting', until }),
    })
  }

  async function runOutline(key: ActiveKey, queue: AiQueue, signal: AbortSignal): Promise<boolean> {
    if (!ctx) return false
    const { opts } = ctx
    const adapter = adapterFor(key)
    set({ phase: 'outline', outlineStatus: { state: 'queued' } })
    const startedAt = performance.now()
    const jobId = await startJob({
      map_id: opts.mapId,
      pass: 'outline',
      provider: adapter.provider,
      model: adapter.model,
      prompt_version: OUTLINE_PROMPT_VERSION,
      chapter_node_id: opts.rootId,
    })
    try {
      const result = await queue.run(
        'outline',
        () =>
          generateStructured({
            adapter,
            system: SYSTEM_PROMPT,
            prompt: outlinePrompt({
              chapterTitle: opts.title,
              sourceLanguage: opts.sourceLanguage,
              paragraphs: opts.paragraphs,
            }),
            schema: outlineSchemaFor(opts.paragraphs.length),
            jsonSchema: toProviderSchema(OutlineResponseSchema),
            signal,
          }),
        signal,
      )
      void finishJob(jobId, {
        status: 'done',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: performance.now() - startedAt,
      })
      const warnings = checkOutlineRules(result.data)
      if (warnings.length)
        console.warn(
          'outline style warnings',
          warnings.map((w) => w.rule),
        )

      const outline = normalizeOutline(result.data, opts.paragraphs.length)
      const nodes = sectionNodes(outline, {
        mapId: opts.mapId,
        rootId: opts.rootId,
        lang: opts.sourceLanguage,
      })
      ctx.outline = outline
      ctx.sectionRanges = Object.fromEntries(
        nodes.flatMap((n, i) => {
          const s = outline.sections[i]
          return s
            ? [
                [
                  n.id,
                  { from: s.paragraphs.from, to: s.paragraphs.to, title: s.title, shape: s.shape },
                ] as const,
              ]
            : []
        }),
      )
      useWorkspace.getState().addNodes(nodes, { saveNow: true })
      set({
        outlineStatus: { state: 'done' },
        order: nodes.map((n) => n.id),
        sections: Object.fromEntries(
          nodes.map((n) => [n.id, { state: 'queued' } as SectionStatus]),
        ),
      })
      return true
    } catch (e) {
      const kind = kindOf(e)
      void finishJob(jobId, {
        status: 'failed',
        durationMs: performance.now() - startedAt,
        error: e instanceof Error ? e.message : String(e),
      })
      set({
        outlineStatus: { state: 'failed', kind },
        phase: kind === 'aborted' ? 'stopped' : 'failed',
        failure: kind,
      })
      return false
    }
  }

  async function runSection(
    sectionId: string,
    key: ActiveKey,
    queue: AiQueue,
    signal: AbortSignal,
  ): Promise<void> {
    if (!ctx?.outline) return
    const { opts, outline } = ctx
    const range = ctx.sectionRanges[sectionId]
    const section = useWorkspace.getState().nodes[sectionId]
    if (!range || !section) return
    const paragraphs = opts.paragraphs.filter((p) => p.n >= range.from && p.n <= range.to)
    const adapter = adapterFor(key)
    setSection(sectionId, { state: 'queued' })
    const startedAt = performance.now()
    const jobId = await startJob({
      map_id: opts.mapId,
      pass: 'details',
      provider: adapter.provider,
      model: adapter.model,
      prompt_version: DETAILS_PROMPT_VERSION,
      chapter_node_id: opts.rootId,
      node_id: sectionId,
    })
    try {
      const result = await queue.run(
        sectionId,
        () =>
          generateStructured({
            adapter,
            system: SYSTEM_PROMPT,
            prompt: detailsPrompt({
              bookTitle: opts.bookTitle ?? opts.title,
              chapterTitle: opts.title,
              outline: outlineText(outline),
              sectionTitle: range.title,
              shape: range.shape,
              sourceLanguage: opts.sourceLanguage,
              explanationLanguage: opts.explanationLanguage,
              detailLevel: opts.detailLevel,
              paragraphs,
            }),
            schema: detailsSchemaFor(opts.paragraphs.length),
            jsonSchema: toProviderSchema(DetailsResponseSchema),
            signal,
          }),
        signal,
      )
      void finishJob(jobId, {
        status: 'done',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        durationMs: performance.now() - startedAt,
      })
      const warnings = checkDetailsRules(result.data)
      if (warnings.length)
        console.warn(
          'details style warnings',
          warnings.map((w) => w.rule),
        )
      const { nodes, relations } = blockNodes(result.data, {
        mapId: opts.mapId,
        section,
        lang: opts.sourceLanguage,
      })
      const ws = useWorkspace.getState()
      ws.addNodes(nodes, { saveNow: true })
      ws.addRelations(relations, { saveNow: true })
      setSection(sectionId, { state: 'done' })
    } catch (e) {
      void finishJob(jobId, {
        status: 'failed',
        durationMs: performance.now() - startedAt,
        error: e instanceof Error ? e.message : String(e),
      })
      setSection(sectionId, { state: 'failed', kind: kindOf(e) })
    }
  }

  function settle() {
    const statuses = Object.values(get().sections)
    if (get().phase === 'stopped') return
    if (statuses.every((s) => s.state === 'done')) set({ phase: 'done' })
    else if (statuses.every((s) => s.state === 'done' || s.state === 'failed'))
      set({ phase: 'failed' })
  }

  async function runDetails(key: ActiveKey, ids: string[]) {
    const ctrl = new AbortController()
    controller = ctrl
    const queue = makeQueue()
    set({ phase: 'details', failure: null })
    await Promise.all(ids.map((id) => runSection(id, key, queue, ctrl.signal)))
    settle()
  }

  return {
    mapId: null,
    provider: null,
    phase: 'idle',
    outlineStatus: { state: 'queued' },
    sections: {},
    order: [],
    failure: null,
    chapters: {},
    chapterOrder: [],
    currentChapter: null,

    startBook: async (jobs, key) => {
      bookStopped = false
      set({
        chapters: Object.fromEntries(jobs.map((j) => [j.rootId, 'queued' as const])),
        chapterOrder: jobs.map((j) => j.rootId),
        currentChapter: null,
      })
      for (const job of jobs) {
        if (bookStopped) break
        set({
          currentChapter: job.rootId,
          chapters: { ...get().chapters, [job.rootId]: 'running' },
        })
        await get().start(job, key)
        const phase = get().phase
        const state: ChapterBuildState =
          phase === 'done' ? 'done' : phase === 'stopped' ? 'stopped' : 'failed'
        set({ chapters: { ...get().chapters, [job.rootId]: state } })
        if (state === 'stopped') bookStopped = true
      }
      if (bookStopped)
        set({
          chapters: Object.fromEntries(
            Object.entries(get().chapters).map(([id, st]) => [
              id,
              st === 'queued' ? 'stopped' : st,
            ]),
          ),
        })
      set({ currentChapter: null })
    },

    start: async (opts, key) => {
      controller?.abort() // a previous run of this store, if any (not a book stop)
      ctx = { opts, outline: null, sectionRanges: {} }
      controller = new AbortController()
      set({
        mapId: opts.mapId,
        provider: key.provider,
        phase: 'outline',
        outlineStatus: { state: 'queued' },
        sections: {},
        order: [],
        failure: null,
      })
      const ok = await runOutline(key, makeQueue(), controller.signal)
      if (ok) await runDetails(key, get().order)
    },

    retryOutline: async (key) => {
      if (!ctx) return
      controller = new AbortController()
      const ok = await runOutline(key, makeQueue(), controller.signal)
      if (ok) await runDetails(key, get().order)
    },

    retrySection: async (sectionId, key) => {
      if (!ctx?.outline) return
      const queue = makeQueue()
      controller ??= new AbortController()
      set({ phase: 'details' })
      await runSection(sectionId, key, queue, controller.signal)
      settle()
    },

    stop: () => {
      bookStopped = true
      controller?.abort()
      controller = null
      if (get().phase === 'outline' || get().phase === 'details') set({ phase: 'stopped' })
    },

    clear: () => {
      get().stop()
      ctx = null
      set({
        mapId: null,
        provider: null,
        phase: 'idle',
        sections: {},
        order: [],
        failure: null,
        chapters: {},
        chapterOrder: [],
        currentChapter: null,
      })
    },
  }
})
