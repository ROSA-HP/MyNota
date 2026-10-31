import { z } from 'zod'

/** One card the model suggests. `block` is a short id from the prompt (B1, B2, …). */
export const AiCardSchema = z.object({
  block: z.string().trim().min(1).max(12),
  type: z.enum(['basic', 'cloze']),
  front: z.string().trim().min(1).max(300),
  back: z.string().trim().max(600),
})

/**
 * "Make cards" reply. Lenient about ids and duplicates: unknown blocks, cloze cards without a
 * {{gap}} and repeats are dropped in code (toCardDrafts) instead of failing the whole reply.
 */
export const CardsResponseSchema = z.object({
  cards: z.array(AiCardSchema).max(40),
})

export type CardsResponse = z.infer<typeof CardsResponseSchema>
export type AiCard = z.infer<typeof AiCardSchema>
