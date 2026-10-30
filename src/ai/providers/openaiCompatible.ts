import { AiError, isAbortError, registerSecret } from '../errors'
import type {
  GenerateRequest,
  GenerateResult,
  KeyTestResult,
  ModelInfo,
  ProviderAdapter,
} from '../types'

/**
 * Any endpoint that speaks the OpenAI Chat Completions format (OpenAI, OpenRouter, Groq, a local
 * server…), called directly from the browser. Endpoints differ in what they accept, so the
 * adapter starts with the strictest structured-output mode and steps down when an endpoint
 * rejects a parameter, remembering what worked per endpoint + model:
 *
 *   response_format json_schema → json_object → none (schema in the prompt)
 *
 * Whatever the mode, the reply goes through the same Zod validation and one repair retry.
 */
type Fetch = typeof fetch

export type JsonMode = 'json_schema' | 'json_object' | 'none'

interface Capabilities {
  mode: JsonMode
  temperature: boolean
  maxTokensField: 'max_tokens' | 'max_completion_tokens'
}

interface OpenAiErrorBody {
  error?: { message?: string; type?: string; code?: string | number } | string
  message?: string
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null }
    finish_reason?: string
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * Accepts https URLs, and plain http only for this computer (local model servers).
 * Returns the normalised base (no trailing slash) or null when not allowed.
 */
export function normalizeBaseUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if (url.username || url.password || url.search || url.hash) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function errorMessage(body: OpenAiErrorBody, status: number): string {
  if (typeof body.error === 'string') return body.error
  return body.error?.message ?? body.message ?? `HTTP ${status}`
}

async function toAiError(res: Response): Promise<AiError> {
  let body: OpenAiErrorBody = {}
  try {
    body = (await res.json()) as OpenAiErrorBody
  } catch {
    /* non-JSON error body */
  }
  const status = res.status
  const message = errorMessage(body, status)
  const retryAfterMs = Number(res.headers.get('retry-after')) * 1000 || undefined
  if (status === 429) return new AiError('rate_limited', message, { status, retryAfterMs })
  if (status === 401 || status === 403) return new AiError('invalid_key', message, { status })
  if (status === 413) return new AiError('too_long', message, { status })
  if (status >= 500) return new AiError('overloaded', message, { status, retryAfterMs })
  if (/context length|maximum context|too many tokens/i.test(message))
    return new AiError('too_long', message, { status })
  return new AiError('bad_request', message, { status })
}

async function send(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch (e) {
    if (isAbortError(e)) throw e
    // A browser can't tell a CORS refusal from an unreachable server; both look like this.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw offline
      ? new AiError('network', 'You appear to be offline.')
      : new AiError('unreachable', 'The endpoint could not be reached from the browser.')
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

/** What to step down to when the endpoint rejects part of the request, or null if nothing fits. */
export function downgrade(caps: Capabilities, message: string): Capabilities | null {
  const m = message.toLowerCase()
  if (caps.temperature && /temperature/.test(m)) return { ...caps, temperature: false }
  if (
    caps.maxTokensField === 'max_tokens' &&
    /max_tokens/.test(m) &&
    /max_completion_tokens/.test(m)
  )
    return { ...caps, maxTokensField: 'max_completion_tokens' }
  if (/response_format|json_schema|json_object|structured|schema/.test(m)) {
    if (caps.mode === 'json_schema') return { ...caps, mode: 'json_object' }
    if (caps.mode === 'json_object') return { ...caps, mode: 'none' }
  }
  return null
}

export class OpenAiCompatibleAdapter implements ProviderAdapter {
  readonly provider = 'openai_compatible' as const
  private static learned = new Map<string, Capabilities>()
  private readonly base: string

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: Fetch = (...a) => fetch(...a),
  ) {
    const base = normalizeBaseUrl(baseUrl)
    if (!base) throw new AiError('bad_request', 'The endpoint address is not allowed.')
    this.base = base
    if (apiKey) registerSecret(apiKey)
  }

  private get cacheKey(): string {
    return `${this.base}|${this.model}`
  }

  private body(req: GenerateRequest, caps: Capabilities): string {
    const schemaText = JSON.stringify(req.jsonSchema)
    const system =
      caps.mode === 'json_schema'
        ? req.system
        : `${req.system}\n\nReply with one JSON object only, no other text. It must match this JSON Schema:\n${schemaText}`
    return JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: req.prompt },
      ],
      ...(caps.mode === 'json_schema'
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'result', schema: req.jsonSchema, strict: false },
            },
          }
        : caps.mode === 'json_object'
          ? { response_format: { type: 'json_object' } }
          : {}),
      ...(caps.temperature ? { temperature: 0.2 } : {}),
      ...(req.maxOutputTokens ? { [caps.maxTokensField]: req.maxOutputTokens } : {}),
    })
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    let caps: Capabilities = OpenAiCompatibleAdapter.learned.get(this.cacheKey) ?? {
      mode: 'json_schema',
      temperature: true,
      maxTokensField: 'max_tokens',
    }
    let res: Response | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await send(this.fetchImpl, `${this.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(this.apiKey) },
        body: this.body(req, caps),
        signal: req.signal,
      })
      if (res.ok || (res.status !== 400 && res.status !== 422)) break
      const err = await toAiError(res.clone())
      const next = downgrade(caps, err.message)
      if (!next) throw err
      caps = next
    }
    if (!res) throw new AiError('unknown', 'No response.')
    if (!res.ok) throw await toAiError(res)
    OpenAiCompatibleAdapter.learned.set(this.cacheKey, caps)

    const data = (await res.json()) as ChatResponse
    const choice = data.choices?.[0]
    if (choice?.message?.refusal) throw new AiError('blocked', 'The model declined this text.')
    if (choice?.finish_reason === 'content_filter')
      throw new AiError('blocked', 'The provider filtered this reply.')
    if (choice?.finish_reason === 'length')
      throw new AiError('truncated', 'The reply was cut off because it was too long.')
    const text = choice?.message?.content ?? ''
    if (!text) throw new AiError('invalid_output', 'The model returned an empty reply.')
    return {
      text,
      tokensIn: data.usage?.prompt_tokens,
      tokensOut: data.usage?.completion_tokens,
    }
  }
}

interface ModelList {
  data?: Array<{ id?: string; context_length?: number; name?: string }>
}

/**
 * "Test": lists the endpoint's models. Some servers don't implement /models; then, if the user
 * typed a model name, one tiny completion proves the endpoint, key and model work.
 */
export async function testOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model?: string,
  fetchImpl: Fetch = (...a) => fetch(...a),
  signal?: AbortSignal,
): Promise<KeyTestResult> {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) throw new AiError('bad_request', 'The endpoint address is not allowed.')
  if (apiKey) registerSecret(apiKey)
  const res = await send(fetchImpl, `${base}/models`, { headers: authHeaders(apiKey), signal })
  if (res.ok) {
    const body = (await res.json()) as ModelList
    const models: ModelInfo[] = (body.data ?? [])
      .filter((m) => m.id)
      .map((m) => ({
        id: m.id ?? '',
        label: m.name ?? m.id ?? '',
        inputTokenLimit: m.context_length,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    if (models.length) return { models }
  } else if (res.status === 401 || res.status === 403) {
    throw await toAiError(res)
  }
  if (!model) {
    throw new AiError('bad_request', 'This endpoint does not list its models. Type a model name.')
  }
  const adapter = new OpenAiCompatibleAdapter(base, apiKey, model, fetchImpl)
  await adapter.generate({
    system: 'You are a connectivity check.',
    prompt: 'Reply with {"ok": true}.',
    jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
    maxOutputTokens: 64,
    signal,
  })
  return { models: [{ id: model, label: model }] }
}
