import { finishJob, startJob } from '@/ai/jobs'
import { toProviderSchema } from '@/ai/jsonSchema'
import { mergeOutline, toPlan, type PlanItem } from '@/ai/pipeline/merge'
import { MERGE_PROMPT_VERSION, mergePrompt } from '@/ai/prompts/merge.v1'
import { SYSTEM_PROMPT, type Paragraph } from '@/ai/prompts/shared'
import { createAdapter } from '@/ai/providers'
import { AiQueue } from '@/ai/queue'
import { MergeResponseSchema, mergeSchemaFor } from '@/ai/schemas/merge'
import { generateStructured } from '@/ai/structured'
import type { ActiveKey } from '@/features/settings/aiKeyStore'
import type { NodeRow } from '@/lib/database.types'

/** One request: at most this many new paragraphs, so the reply stays reviewable. */
export const MAX_MERGE_NOTES = 120
export const MAX_MERGE_CHARS = 40_000

/** Asks the student's AI where each new note belongs; returns a plan to review. */
export async function planMerge(input: {
  mapId: string
  mapTitle: string
  rootId: string
  nodes: Record<string, NodeRow>
  notes: Paragraph[]
  language: string | null
  fallbackTitle: string
  key: ActiveKey
  signal: AbortSignal
  onWait?: (until: number | null) => void
}): Promise<PlanItem[]> {
  const ctx = mergeOutline(input.nodes, input.rootId)
  const adapter = createAdapter(input.key)
  const startedAt = performance.now()
  const jobId = await startJob({
    map_id: input.mapId,
    pass: 'merge',
    provider: adapter.provider,
    model: adapter.model,
    prompt_version: MERGE_PROMPT_VERSION,
    chapter_node_id: input.rootId,
  })
  const queue = new AiQueue({
    concurrency: 1,
    onStart: () => input.onWait?.(null),
    onWait: (_, until) => input.onWait?.(until),
  })
  try {
    const result = await queue.run(
      'merge',
      () =>
        generateStructured({
          adapter,
          system: SYSTEM_PROMPT,
          prompt: mergePrompt({
            mapTitle: input.mapTitle,
            outline: ctx.outline,
            language: input.language,
            notes: input.notes,
          }),
          schema: mergeSchemaFor(ctx.ids, input.notes.length),
          jsonSchema: toProviderSchema(MergeResponseSchema),
          signal: input.signal,
        }),
      input.signal,
    )
    void finishJob(jobId, {
      status: 'done',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs: performance.now() - startedAt,
    })
    return toPlan(result.data, ctx, input.notes, input.fallbackTitle)
  } catch (e) {
    void finishJob(jobId, {
      status: 'failed',
      durationMs: performance.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}
