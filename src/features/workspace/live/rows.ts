import { z } from 'zod'
import { BRANCH_SHAPES, IMPORTANCE, NODE_TYPES, RELATION_TYPES } from '@/ai/schemas/common'
import type { ChapterColor, DetailBlock, NodeRow, RelationRow } from '@/lib/database.types'

/**
 * Rows read from a live document were written by other people's devices, so they are untrusted:
 * the fields that identify a row must be valid or the row is ignored; every other field falls
 * back to a safe default when its value has the wrong shape.
 */

const COLORS: ChapterColor[] = [
  'yellow',
  'coral',
  'sky',
  'mint',
  'lavender',
  'pink',
  'orange',
  'lime',
]
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const text = (max: number) => z.string().max(max).catch('')
const optText = z.string().max(4000).optional().catch(undefined)
const point = z.object({ x: z.number().finite(), y: z.number().finite() })
const box = z.object({ w: z.number().finite().nonnegative(), h: z.number().finite().nonnegative() })
const time = z.string().max(40).catch('')

const detailSchema: z.ZodType<DetailBlock> = z.union([
  z.object({ kind: z.literal('text'), text: z.string().max(4000) }),
  z.object({ kind: z.literal('bullet'), text: z.string().max(4000) }),
  z.object({ kind: z.literal('example'), text: z.string().max(4000), translation: optText }),
  z.object({
    kind: z.literal('vocab'),
    term: z.string().max(4000),
    meaning: z.string().max(4000),
    article: optText,
    plural: optText,
    lang: optText,
  }),
  z.object({ kind: z.literal('formula'), latex: z.string().max(4000), variables: optText }),
  z.object({
    kind: z.literal('question'),
    front: z.string().max(4000),
    back: z.string().max(4000),
  }),
  z.object({ kind: z.literal('cloze'), text: z.string().max(4000) }),
])

/** Keeps the valid detail blocks, drops the others (one bad block does not hide the rest). */
const details = z
  .array(z.unknown())
  .max(200)
  .transform((items) =>
    items.flatMap((d) => {
      const r = detailSchema.safeParse(d)
      return r.success ? [r.data] : []
    }),
  )
  .catch([])

const nodeSchema = z.object({
  id: uuid,
  map_id: uuid,
  parent_id: uuid.nullable(),
  level: z.enum(['book', 'chapter', 'section', 'block']),
  sort_order: z.number().int().catch(0),
  title: text(500),
  summary: text(4000),
  type: z.enum(NODE_TYPES).nullable().catch(null),
  icon: z.string().max(64).nullable().catch(null),
  color: z.enum(COLORS).nullable().catch(null),
  importance: z.enum(IMPORTANCE).catch('supporting'),
  details,
  lang: z.string().max(16).nullable().catch(null),
  dir: z.enum(['ltr', 'rtl']).catch('ltr'),
  branch_view: z.enum(BRANCH_SHAPES).catch('tree'),
  position: point.nullable().catch(null),
  size: box.nullable().catch(null),
  collapsed: z.boolean().catch(false),
  source: z
    .object({
      paragraphs: z.array(z.number().int().min(1)).max(500),
      page: z.number().int().min(1).optional(),
    })
    .catch({ paragraphs: [] }),
  ai_added: z.boolean().catch(false),
  ai_added_reason: z.string().max(1000).nullable().catch(null),
  origin: z.enum(['user', 'ai']).catch('user'),
  created_by: uuid.nullable().catch(null),
  created_at: time,
  updated_at: time,
})

const relationSchema = z.object({
  id: uuid,
  map_id: uuid,
  from_node: uuid,
  to_node: uuid,
  type: z.enum(RELATION_TYPES).catch('related'),
  label: text(60),
  direction: z.enum(['forward', 'backward', 'both']).catch('forward'),
  status: z.enum(['suggested', 'accepted', 'dismissed']).catch('accepted'),
  confidence: z.enum(['high', 'medium']).nullable().catch(null),
  origin: z.enum(['user', 'ai']).catch('user'),
  created_by: uuid.nullable().catch(null),
  created_at: time,
  updated_at: time,
})

/** A node from a live document, or null when it cannot be one (deleted, partial or bogus). */
export function parseNode(value: unknown, mapId: string): NodeRow | null {
  const r = nodeSchema.safeParse(value)
  return r.success && r.data.map_id === mapId ? r.data : null
}

export function parseRelation(value: unknown, mapId: string): RelationRow | null {
  const r = relationSchema.safeParse(value)
  return r.success && r.data.map_id === mapId && r.data.from_node !== r.data.to_node ? r.data : null
}
