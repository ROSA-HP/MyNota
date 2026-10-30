import type { z } from 'zod'
import { AiError } from './errors'
import type { GenerateRequest, ProviderAdapter } from './types'

export interface StructuredOptions<T> {
  adapter: ProviderAdapter
  system: string
  prompt: string
  /** Full schema including cross-field checks (superRefine). */
  schema: z.ZodType<T>
  /** JSON Schema sent to the provider (from the base schema). */
  jsonSchema: Record<string, unknown>
  maxOutputTokens?: number
  signal?: AbortSignal
}

export interface StructuredResult<T> {
  data: T
  attempts: 1 | 2
  tokensIn: number
  tokensOut: number
}

/** Pulls a JSON value out of a reply, tolerating ```json fences or text around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  const candidate = fenced?.[1] ?? trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.search(/[{[]/)
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
    throw new SyntaxError('Reply is not valid JSON')
  }
}

const MAX_ISSUES = 12
const MAX_ECHO_CHARS = 12000

/** Short, model-readable list of what was wrong. Never includes the source text. */
export function describeIssues(error: z.ZodError | SyntaxError): string {
  if (error instanceof SyntaxError)
    return '- The reply was not valid JSON. Return one JSON object only, no markdown.'
  return error.issues
    .slice(0, MAX_ISSUES)
    .map((i) => `- ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('\n')
}

export function repairPrompt(original: string, previousReply: string, issues: string): string {
  const echo =
    previousReply.length > MAX_ECHO_CHARS
      ? `${previousReply.slice(0, MAX_ECHO_CHARS)}…`
      : previousReply
  return `${original}

YOUR PREVIOUS REPLY
${echo}

THAT REPLY WAS INVALID
${issues}

Return the complete, corrected JSON object only. Keep everything that was already correct.`
}

function parse<T>(
  schema: z.ZodType<T>,
  text: string,
): { ok: true; data: T } | { ok: false; error: z.ZodError | SyntaxError } {
  let json: unknown
  try {
    json = extractJson(text)
  } catch (e) {
    return { ok: false, error: e as SyntaxError }
  }
  const r = schema.safeParse(json)
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error }
}

/**
 * Calls the provider, validates the reply with Zod and, if it is invalid, retries exactly once
 * with the validation errors (docs/ai-pipeline.md). A second invalid reply throws invalid_output.
 */
export async function generateStructured<T>(
  opts: StructuredOptions<T>,
): Promise<StructuredResult<T>> {
  const base: GenerateRequest = {
    system: opts.system,
    prompt: opts.prompt,
    jsonSchema: opts.jsonSchema,
    maxOutputTokens: opts.maxOutputTokens,
    signal: opts.signal,
  }

  const first = await opts.adapter.generate(base)
  let tokensIn = first.tokensIn ?? 0
  let tokensOut = first.tokensOut ?? 0
  const firstParse = parse(opts.schema, first.text)
  if (firstParse.ok) return { data: firstParse.data, attempts: 1, tokensIn, tokensOut }

  const second = await opts.adapter.generate({
    ...base,
    prompt: repairPrompt(opts.prompt, first.text, describeIssues(firstParse.error)),
  })
  tokensIn += second.tokensIn ?? 0
  tokensOut += second.tokensOut ?? 0
  const secondParse = parse(opts.schema, second.text)
  if (secondParse.ok) return { data: secondParse.data, attempts: 2, tokensIn, tokensOut }

  const summary =
    secondParse.error instanceof SyntaxError
      ? 'not JSON'
      : `${secondParse.error.issues.length} problem(s)`
  throw new AiError(
    'invalid_output',
    `AI reply did not match the expected format after one repair attempt (${summary}).`,
  )
}
