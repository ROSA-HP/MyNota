import { z } from 'zod'

type Json = { [k: string]: unknown }

// Keywords providers either ignore or choke on in large nested schemas. Zod still enforces them.
const DROP = new Set([
  '$schema',
  'default',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'pattern',
  'format',
  '$id',
])

function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify)
  if (!node || typeof node !== 'object') return node
  const obj = node as Json

  // anyOf [X, {type:'null'}]  →  X with type [X.type, 'null']  (widely supported nullable form)
  if (Array.isArray(obj.anyOf) && obj.anyOf.length === 2) {
    const [a, b] = obj.anyOf as Json[]
    const nonNull = a?.type === 'null' ? b : b?.type === 'null' ? a : undefined
    if (nonNull && typeof nonNull.type === 'string') {
      const merged = simplify(nonNull) as Json
      return { ...merged, type: [nonNull.type, 'null'] }
    }
  }

  const out: Json = {}
  for (const [k, v] of Object.entries(obj)) {
    if (DROP.has(k)) continue
    out[k] = simplify(v)
  }
  return out
}

/**
 * JSON Schema sent to providers for structured output. Built from the *base* Zod schema
 * (no cross-field refinements, which JSON Schema cannot express). Output mode makes fields
 * that have defaults required, so the model always fills them in.
 */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  return simplify(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' })) as Record<
    string,
    unknown
  >
}
