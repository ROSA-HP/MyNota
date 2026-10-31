import { finishJob, startJob } from '@/ai/jobs'
import { toProviderSchema } from '@/ai/jsonSchema'
import { cardsContext, toCardDrafts } from '@/ai/pipeline/cards'
import { CARDS_PROMPT_VERSION, cardsPrompt } from '@/ai/prompts/cards.v1'
import { SYSTEM_PROMPT } from '@/ai/prompts/shared'
import { createAdapter } from '@/ai/providers'
import { AiQueue } from '@/ai/queue'
import { CardsResponseSchema } from '@/ai/schemas/cards'
import { generateStructured } from '@/ai/structured'
import type { ActiveKey } from '@/features/settings/aiKeyStore'
import { NODE_COLUMNS } from '@/features/workspace/mapRepo'
import type { NodeRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import type { CardDraft } from '../autoCards'
import { useDeck } from '../deckStore'

/** Asks the student's AI for new cards on some blocks of the map; returns the new drafts. */
export async function makeCards(input: {
  mapId: string
  /** What the cards are about (map or chapter title), for the prompt. */
  title: string
  blockIds: string[]
  /** Outline order, so the prompt lists blocks the way the map does. */
  order: Map<string, number>
  count: number
  key: ActiveKey
  signal: AbortSignal
  onWait?: (until: number | null) => void
}): Promise<CardDraft[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select(NODE_COLUMNS)
    .eq('map_id', input.mapId)
    .eq('level', 'block')
  if (error) throw error
  const wanted = new Set(input.blockIds)
  const blocks = (data as NodeRow[])
    .filter((n) => wanted.has(n.id))
    .sort((a, b) => (input.order.get(a.id) ?? 0) - (input.order.get(b.id) ?? 0))
  const ctx = cardsContext(blocks, Object.values(useDeck.getState().cards))
  if (!ctx.blocks.length) return []
  const language = blocks.find((b) => b.lang)?.lang ?? null

  const adapter = createAdapter(input.key)
  const startedAt = performance.now()
  const jobId = await startJob({
    map_id: input.mapId,
    pass: 'tool',
    provider: adapter.provider,
    model: adapter.model,
    prompt_version: CARDS_PROMPT_VERSION,
  })
  const queue = new AiQueue({
    concurrency: 1,
    onStart: () => input.onWait?.(null),
    onWait: (_, until) => input.onWait?.(until),
  })
  try {
    const result = await queue.run(
      'cards',
      () =>
        generateStructured({
          adapter,
          system: SYSTEM_PROMPT,
          prompt: cardsPrompt({
            title: input.title,
            language,
            count: input.count,
            blocks: ctx.blocks,
          }),
          schema: CardsResponseSchema,
          jsonSchema: toProviderSchema(CardsResponseSchema),
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
    return toCardDrafts(result.data, ctx, language, input.count)
  } catch (e) {
    void finishJob(jobId, {
      status: 'failed',
      durationMs: performance.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}
