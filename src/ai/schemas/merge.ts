import { z } from 'zod'
import {
  BranchShapeSchema,
  ImportanceSchema,
  LIMITS,
  NodeTypeSchema,
  paragraphNumber,
  summarySchema,
  titleSchema,
} from './common'

export const MERGE_ACTIONS = ['attach', 'detail', 'new_section', 'skip'] as const

/** A new block placed by the merge pass. `notes` are N numbers (N4 is 4). */
export const MergeBlockSchema = z.object({
  title: titleSchema,
  summary: summarySchema,
  type: NodeTypeSchema,
  importance: ImportanceSchema,
  notes: z.array(paragraphNumber).min(1).max(30),
  added: z.boolean().default(false),
  added_reason: z.string().trim().max(200).nullable().default(null),
})

/**
 * One decision for a group of new notes. A flat object with nullable fields (rather than a
 * union) so every provider's structured-output mode accepts the schema:
 * - attach: new blocks under an existing section or block (`parent`, optionally `after`)
 * - detail: adds a detail line to an existing block (`target`, `detail`)
 * - new_section: a new section (`section`) with its blocks
 * - skip: already on the map (`duplicate_of`)
 */
export const MergeItemSchema = z.object({
  action: z.enum(MERGE_ACTIONS),
  notes: z.array(paragraphNumber).min(1).max(60),
  parent: z.string().trim().max(12).nullable().default(null),
  after: z.string().trim().max(12).nullable().default(null),
  target: z.string().trim().max(12).nullable().default(null),
  duplicate_of: z.string().trim().max(12).nullable().default(null),
  section: z
    .object({ title: titleSchema, summary: summarySchema, shape: BranchShapeSchema })
    .nullable()
    .default(null),
  blocks: z.array(MergeBlockSchema).max(LIMITS.maxBlocksPerSection).default([]),
  detail: z.string().trim().max(LIMITS.detailChars).nullable().default(null),
})

export const MergeResponseSchema = z.object({
  items: z.array(MergeItemSchema).min(1).max(80),
})

export type MergeResponse = z.infer<typeof MergeResponseSchema>
export type MergeItem = z.infer<typeof MergeItemSchema>
export type MergeBlock = z.infer<typeof MergeBlockSchema>

/**
 * Full validation: ids must exist on the map with the right kind, each action has what it
 * needs, and note numbers stay inside N1..Nk. Errors go back to the model in the repair retry.
 */
export function mergeSchemaFor(ids: { sections: Set<string>; blocks: Set<string> }, notes: number) {
  const known = (id: string | null) => id !== null && (ids.sections.has(id) || ids.blocks.has(id))
  return MergeResponseSchema.superRefine((res, ctx) => {
    res.items.forEach((item, i) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path: ['items', i, ...path], message })
      const allNotes = [...item.notes, ...item.blocks.flatMap((b) => b.notes)]
      for (const n of allNotes)
        if (n > notes)
          issue(['notes'], `Note N${n} does not exist; the notes run from N1 to N${notes}.`)
      if (item.action === 'attach') {
        if (!known(item.parent))
          issue(['parent'], `"${item.parent}" is not an id on the map. Use an S… or B… id.`)
        if (item.after !== null && !ids.blocks.has(item.after))
          issue(['after'], `"${item.after}" is not a block id. Use a B… id or null.`)
        if (!item.blocks.length) issue(['blocks'], 'attach needs at least one block.')
      } else if (item.action === 'detail') {
        if (item.target === null || !ids.blocks.has(item.target))
          issue(['target'], `"${item.target}" is not a block id. Use a B… id.`)
        if (!item.detail) issue(['detail'], 'detail needs the detail text.')
      } else if (item.action === 'new_section') {
        if (!item.section)
          issue(['section'], 'new_section needs a section title, summary and shape.')
        if (!item.blocks.length) issue(['blocks'], 'new_section needs at least one block.')
      } else if (item.duplicate_of !== null && !known(item.duplicate_of)) {
        issue(['duplicate_of'], `"${item.duplicate_of}" is not an id on the map.`)
      }
    })
  })
}
