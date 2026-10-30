import { AiError, isAbortError, registerSecret } from '../errors'
import type {
  GenerateRequest,
  GenerateResult,
  KeyTestResult,
  ModelInfo,
  ProviderAdapter,
} from '../types'

/**
 * Claude via the Messages API, called directly from the browser with the student's key.
 * Anthropic requires the `anthropic-dangerous-direct-browser-access` header for browser calls;
 * that is exactly our bring-your-own-key model (the key belongs to the person using the page).
 *
 * Structured output uses forced tool use: one tool whose input schema is our JSON Schema, and
 * `tool_choice` forcing it. The tool input is returned as JSON text for the shared Zod parser.
 */
export const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const API_VERSION = '2023-06-01'
const TOOL_NAME = 'emit_result'
const DEFAULT_MAX_TOKENS = 16000

type Fetch = typeof fetch

interface AnthropicErrorBody {
  type?: string
  error?: { type?: string; message?: string }
}

interface AnthropicResponse {
  content?: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: unknown }
    | { type: string }
  >
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

function headers(apiKey: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

async function toAiError(res: Response): Promise<AiError> {
  let body: AnthropicErrorBody = {}
  try {
    body = (await res.json()) as AnthropicErrorBody
  } catch {
    /* non-JSON error body */
  }
  const status = res.status
  const type = body.error?.type ?? ''
  const message = body.error?.message ?? `HTTP ${status}`
  const retryAfterMs = Number(res.headers.get('retry-after')) * 1000 || undefined

  if (status === 429 || type === 'rate_limit_error')
    return new AiError('rate_limited', message, { status, retryAfterMs })
  if (
    status === 401 ||
    status === 403 ||
    type === 'authentication_error' ||
    type === 'permission_error'
  )
    return new AiError('invalid_key', message, { status })
  if (status === 529 || status >= 500 || type === 'overloaded_error' || type === 'api_error')
    return new AiError('overloaded', message, { status, retryAfterMs })
  if (status === 413 || type === 'request_too_large')
    return new AiError('too_long', message, { status })
  return new AiError('bad_request', message, { status })
}

async function send(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch (e) {
    if (isAbortError(e)) throw e
    throw new AiError('network', 'Could not reach Claude.')
  }
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = 'anthropic' as const
  /** Models that refuse `temperature` (remembered after the first refusal). */
  private static noTemperature = new Set<string>()

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: Fetch = (...a) => fetch(...a),
  ) {
    registerSecret(apiKey)
  }

  private body(req: GenerateRequest, withTemperature: boolean): string {
    return JSON.stringify({
      model: this.model,
      max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      tools: [
        {
          name: TOOL_NAME,
          description: 'Return the result. Always call this tool exactly once.',
          input_schema: req.jsonSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      ...(withTemperature ? { temperature: 0.2 } : {}),
    })
  }

  private post(req: GenerateRequest, withTemperature: boolean): Promise<Response> {
    return send(this.fetchImpl, `${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: headers(this.apiKey),
      body: this.body(req, withTemperature),
      signal: req.signal,
    })
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const useTemp = !AnthropicAdapter.noTemperature.has(this.model)
    let res = await this.post(req, useTemp)
    if (!res.ok && res.status === 400 && useTemp) {
      const err = await toAiError(res.clone())
      if (!/temperature/i.test(err.message)) throw err
      AnthropicAdapter.noTemperature.add(this.model)
      res = await this.post(req, false)
    }
    if (!res.ok) throw await toAiError(res)

    const data = (await res.json()) as AnthropicResponse
    if (data.stop_reason === 'refusal') throw new AiError('blocked', 'Claude declined this text.')
    if (data.stop_reason === 'max_tokens')
      throw new AiError('truncated', 'The reply was cut off because it was too long.')

    const tool = data.content?.find(
      (c): c is { type: 'tool_use'; name: string; input: unknown } => c.type === 'tool_use',
    )
    let text: string
    if (tool) {
      text = JSON.stringify(tool.input)
    } else {
      // Should not happen with a forced tool, but some gateways drop tool_choice: fall back to
      // any text the model wrote and let the shared parser + repair handle it.
      text = (data.content ?? [])
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
    }
    if (!text) throw new AiError('invalid_output', 'Claude returned an empty reply.')
    return { text, tokensIn: data.usage?.input_tokens, tokensOut: data.usage?.output_tokens }
  }
}

interface AnthropicModelList {
  data?: Array<{ id?: string; display_name?: string; created_at?: string; type?: string }>
  has_more?: boolean
}

/**
 * Sonnet first (best value for structured extraction), then Haiku (cheapest), then Opus and the
 * rest; newest first inside each family.
 */
export function rankAnthropicModels(
  models: Array<ModelInfo & { createdAt?: string }>,
): ModelInfo[] {
  const family = (id: string) =>
    /sonnet/.test(id) ? 0 : /haiku/.test(id) ? 1 : /opus/.test(id) ? 2 : 3
  return [...models]
    .sort(
      (a, b) =>
        family(a.id) - family(b.id) ||
        (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
        a.id.localeCompare(b.id),
    )
    .map((m) => ({ id: m.id, label: m.label, inputTokenLimit: m.inputTokenLimit }))
}

/** "Test key": lists the models this key can use. No tokens are spent. */
export async function testAnthropicKey(
  apiKey: string,
  fetchImpl: Fetch = (...a) => fetch(...a),
  signal?: AbortSignal,
): Promise<KeyTestResult> {
  registerSecret(apiKey)
  const res = await send(fetchImpl, `${ANTHROPIC_BASE}/models?limit=100`, {
    headers: headers(apiKey),
    signal,
  })
  if (!res.ok) throw await toAiError(res)
  const body = (await res.json()) as AnthropicModelList
  const models = (body.data ?? [])
    .filter((m) => m.id && (m.type === undefined || m.type === 'model'))
    .map((m) => ({
      id: m.id ?? '',
      label: m.display_name ?? m.id ?? '',
      inputTokenLimit: 200_000,
      createdAt: m.created_at,
    }))
  if (models.length === 0) throw new AiError('invalid_key', 'This key cannot use any Claude model.')
  return { models: rankAnthropicModels(models) }
}
