import { z } from 'zod'
import { LIMITS, RelationTypeSchema } from './common'

/** One suggested link. Block ids are the short ids from the prompt (B1, B2, …). */
export const AiLinkSchema = z.object({
  from: z.string().trim().min(1).max(12),
  to: z.string().trim().min(1).max(12),
  type: RelationTypeSchema,
  label: z.string().trim().max(LIMITS.relationLabelChars),
  confidence: z.enum(['high', 'medium']),
})

/**
 * Cross-links reply. Deliberately lenient about which ids are used: unknown ids, self-links,
 * links inside one section and duplicates are dropped in code (toSuggestions) rather than
 * failing the whole pass.
 */
export const LinksResponseSchema = z.object({
  links: z.array(AiLinkSchema).max(40),
})

export type LinksResponse = z.infer<typeof LinksResponseSchema>
export type AiLink = z.infer<typeof AiLinkSchema>
