import { z } from 'zod'
import type { DetailBlock } from '@/lib/database.types'
import {
  DetailKindSchema,
  ImportanceSchema,
  LIMITS,
  NodeTypeSchema,
  RelationTypeSchema,
  paragraphNumber,
  summarySchema,
  titleSchema,
} from './common'

/**
 * Flat detail shape the model fills in (simpler for models than a union). `text` is the main
 * content; `extra` depends on kind: translation (example), meaning (vocab), what the variables
 * mean (formula), answer (question). Converted to typed DetailBlocks by toDetailBlock().
 */
export const AiDetailSchema = z.object({
  kind: DetailKindSchema,
  text: z.string().trim().min(1).max(LIMITS.detailChars),
  extra: z.string().trim().max(LIMITS.detailChars).optional(),
  article: z.string().trim().max(20).optional(),
  plural: z.string().trim().max(80).optional(),
})
export type AiDetail = z.infer<typeof AiDetailSchema>

export const AiBlockSchema = z.object({
  key: z.string().trim().min(1).max(20),
  parent: z.string().trim().max(20).nullable(),
  title: titleSchema,
  summary: summarySchema,
  type: NodeTypeSchema,
  importance: ImportanceSchema,
  details: z.array(AiDetailSchema).max(LIMITS.maxDetailsPerBlock).default([]),
  source: z.array(paragraphNumber).max(40).default([]),
  added: z.boolean().default(false),
  added_reason: z.string().trim().max(300).nullable().optional(),
})
export type AiBlock = z.infer<typeof AiBlockSchema>

export const AiRelationSchema = z.object({
  from: z.string().trim().min(1).max(20),
  to: z.string().trim().min(1).max(20),
  type: RelationTypeSchema,
  label: z.string().trim().min(1).max(LIMITS.relationLabelChars),
})

export const AiFlashcardSchema = z.object({
  block: z.string().trim().min(1).max(20),
  front: z.string().trim().min(1).max(300),
  back: z.string().trim().min(1).max(600),
})

export const DetailsResponseSchema = z.object({
  blocks: z.array(AiBlockSchema).min(1).max(LIMITS.maxBlocksPerSection),
  relations: z.array(AiRelationSchema).max(30).default([]),
  flashcards: z.array(AiFlashcardSchema).max(40).default([]),
})
export type DetailsResponse = z.infer<typeof DetailsResponseSchema>

/**
 * Full validation for one section: unique keys, parents that exist and form no cycles,
 * at most 7 children per parent, relations between known blocks, citations inside P1..Pn,
 * and an explanation whenever content is marked as added.
 */
export function detailsSchemaFor(paragraphCount: number) {
  return DetailsResponseSchema.superRefine((res, ctx) => {
    const keys = new Map<string, number>()
    res.blocks.forEach((b, i) => {
      if (keys.has(b.key))
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i, 'key'],
          message: `Duplicate block key "${b.key}".`,
        })
      keys.set(b.key, i)
    })

    const children = new Map<string, number>()
    res.blocks.forEach((b, i) => {
      const parent = b.parent ?? '(section)'
      if (b.parent !== null && !keys.has(b.parent)) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i, 'parent'],
          message: `Parent "${b.parent}" is not a block key. Use null for blocks directly under the section.`,
        })
      }
      if (b.parent === b.key) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i, 'parent'],
          message: `Block "${b.key}" cannot be its own parent.`,
        })
      }
      children.set(parent, (children.get(parent) ?? 0) + 1)
      b.source.forEach((p, j) => {
        if (p > paragraphCount) {
          ctx.addIssue({
            code: 'custom',
            path: ['blocks', i, 'source', j],
            message: `P${p} does not exist; cite only P1 to P${paragraphCount}.`,
          })
        }
      })
      if (b.added && !b.added_reason) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i, 'added_reason'],
          message: 'added_reason is required when added is true.',
        })
      }
      if (!b.added && b.source.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i, 'source'],
          message: 'Cite at least one paragraph, or set added to true with added_reason.',
        })
      }
    })

    for (const [parent, count] of children) {
      if (count > LIMITS.maxChildren) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks'],
          message: `${parent === '(section)' ? 'The section' : `Block "${parent}"`} has ${count} children; the maximum is ${LIMITS.maxChildren}. Add a grouping block.`,
        })
      }
    }

    // Cycle check: walk up from every block.
    const parentOf = new Map(res.blocks.map((b) => [b.key, b.parent]))
    for (const b of res.blocks) {
      const seen = new Set<string>()
      let cur: string | null | undefined = b.key
      while (cur) {
        if (seen.has(cur)) {
          ctx.addIssue({
            code: 'custom',
            path: ['blocks'],
            message: `Blocks form a cycle through "${cur}".`,
          })
          break
        }
        seen.add(cur)
        cur = parentOf.get(cur)
      }
      if (seen.size > 0 && cur) break
    }

    res.relations.forEach((r, i) => {
      for (const end of ['from', 'to'] as const) {
        if (!keys.has(r[end]))
          ctx.addIssue({
            code: 'custom',
            path: ['relations', i, end],
            message: `Relation ${end} "${r[end]}" is not a block key.`,
          })
      }
      if (r.from === r.to)
        ctx.addIssue({
          code: 'custom',
          path: ['relations', i],
          message: 'A relation must connect two different blocks.',
        })
    })

    res.flashcards.forEach((f, i) => {
      if (!keys.has(f.block))
        ctx.addIssue({
          code: 'custom',
          path: ['flashcards', i, 'block'],
          message: `Flashcard block "${f.block}" is not a block key.`,
        })
    })
  })
}

/** Converts the model's flat detail into the stored, typed detail block. */
export function toDetailBlock(d: AiDetail): DetailBlock {
  switch (d.kind) {
    case 'text':
    case 'bullet':
    case 'cloze':
      return { kind: d.kind, text: d.text }
    case 'example':
      return d.extra
        ? { kind: 'example', text: d.text, translation: d.extra }
        : { kind: 'example', text: d.text }
    case 'vocab':
      return {
        kind: 'vocab',
        term: d.text,
        meaning: d.extra ?? '',
        ...(d.article ? { article: d.article } : {}),
        ...(d.plural ? { plural: d.plural } : {}),
      }
    case 'formula':
      return d.extra
        ? { kind: 'formula', latex: d.text, variables: d.extra }
        : { kind: 'formula', latex: d.text }
    case 'question':
      return { kind: 'question', front: d.text, back: d.extra ?? '' }
  }
}
