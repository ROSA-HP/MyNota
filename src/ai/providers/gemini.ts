import { AiError, isAbortError, registerSecret } from '../errors'
import type {
  GenerateRequest,
  GenerateResult,
  KeyTestResult,
  ModelInfo,
  ProviderAdapter,
} from '../types'

/**
 * Gemini via the Generative Language API `generateContent` endpoint, called directly from the
 * browser with the student's key in the x-goog-api-key header (never a URL parameter).
 *
 * Google labels generateContent "legacy" but fully supported; the newer Interactions API can
 * replace this file later without touching the rest of the pipeline.
 */
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Preferred defaults, best first. The key test only offers models the key can actually use. */
export const GEMINI_PREFERRED = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']

type Fetch = typeof fetch

interface GeminiErrorBody {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: Array<Record<string, unknown>>
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
  }
}

/** "24s" or "1.5s" → ms */
function parseDuration(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^(\d+(?:\.\d+)?)s$/.exec(v)
  return m ? Math.round(Number(m[1]) * 1000) : undefined
}

async function toAiError(res: Response): Promise<AiError> {
  let body: GeminiErrorBody = {}
  try {
    body = (await res.json()) as GeminiErrorBody
  } catch {
    /* non-JSON error body */
  }
  const status = res.status
  const apiStatus = body.error?.status ?? ''
  const message = body.error?.message ?? `HTTP ${status}`
  const retryInfo = body.error?.details?.find((d) => String(d['@type'] ?? '').endsWith('RetryInfo'))
  const retryAfterMs =
    parseDuration(retryInfo?.retryDelay) ??
    (Number(res.headers.get('retry-after')) * 1000 || undefined)

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED')
    return new AiError('rate_limited', message, { status, retryAfterMs })
  if (
    status === 401 ||
    status === 403 ||
    /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(`${apiStatus} ${message}`)
  ) {
    return new AiError('invalid_key', message, { status })
  }
  if (status === 400 && /API key/i.test(message))
    return new AiError('invalid_key', message, { status })
  if (status >= 500) return new AiError('overloaded', message, { status })
  return new AiError('bad_request', message, { status })
}

export class GeminiAdapter implements ProviderAdapter {
  readonly provider = 'gemini' as const
  /** Some newer models reject `temperature`; remembered per model after the first refusal. */
  private static noTemperature = new Set<string>()

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: Fetch = (...a) => fetch(...a),
  ) {
    registerSecret(apiKey)
  }

  private headers(): HeadersInit {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey }
  }

  private body(req: GenerateRequest, withTemperature: boolean): string {
    return JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: req.jsonSchema,
        ...(withTemperature ? { temperature: 0.2 } : {}),
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
      },
    })
  }

  private async post(req: GenerateRequest, withTemperature: boolean): Promise<Response> {
    try {
      return await this.fetchImpl(
        `${GEMINI_BASE}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: this.headers(),
          body: this.body(req, withTemperature),
          signal: req.signal,
        },
      )
    } catch (e) {
      if (isAbortError(e)) throw e
      throw new AiError('network', 'Could not reach Gemini.')
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const useTemp = !GeminiAdapter.noTemperature.has(this.model)
    let res = await this.post(req, useTemp)
    if (!res.ok && res.status === 400 && useTemp) {
      const err = await toAiError(res.clone())
      if (/temperature/i.test(err.message)) {
        GeminiAdapter.noTemperature.add(this.model)
        res = await this.post(req, false)
      } else {
        throw err
      }
    }
    if (!res.ok) throw await toAiError(res)

    const data = (await res.json()) as GeminiResponse
    if (data.promptFeedback?.blockReason) {
      throw new AiError(
        'blocked',
        `Gemini blocked the request (${data.promptFeedback.blockReason}).`,
      )
    }
    const candidate = data.candidates?.[0]
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
    const finish = candidate?.finishReason
    if (
      finish === 'SAFETY' ||
      finish === 'RECITATION' ||
      finish === 'BLOCKLIST' ||
      finish === 'PROHIBITED_CONTENT'
    ) {
      throw new AiError('blocked', `Gemini stopped the reply (${finish}).`)
    }
    if (finish === 'MAX_TOKENS')
      throw new AiError('truncated', 'The reply was cut off because it was too long.')
    if (!text) throw new AiError('invalid_output', 'Gemini returned an empty reply.')

    const usage = data.usageMetadata
    return {
      text,
      tokensIn: usage?.promptTokenCount,
      tokensOut: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0) || undefined,
    }
  }
}

interface GeminiModelList {
  models?: Array<{
    name?: string
    displayName?: string
    supportedGenerationMethods?: string[]
    inputTokenLimit?: number
    outputTokenLimit?: number
  }>
  nextPageToken?: string
}

/** Orders models: preferred defaults first, then other Flash models, then the rest. */
export function rankGeminiModels(models: ModelInfo[]): ModelInfo[] {
  const score = (m: ModelInfo) => {
    const i = GEMINI_PREFERRED.indexOf(m.id)
    if (i >= 0) return i
    if (/flash/.test(m.id) && !/preview|exp|image|tts|live|audio/.test(m.id)) return 10
    if (/preview|exp|image|tts|live|audio|embedding/.test(m.id)) return 100
    return 50
  }
  return [...models].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))
}

/**
 * "Test key": lists the models this key can call with generateContent. Cheap (no generation)
 * and proves the key is valid. Throws AiError('invalid_key') for a bad key.
 */
export async function testGeminiKey(
  apiKey: string,
  fetchImpl: Fetch = (...a) => fetch(...a),
  signal?: AbortSignal,
): Promise<KeyTestResult> {
  registerSecret(apiKey)
  let res: Response
  try {
    res = await fetchImpl(`${GEMINI_BASE}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
      signal,
    })
  } catch (e) {
    if (isAbortError(e)) throw e
    throw new AiError('network', 'Could not reach Gemini.')
  }
  if (!res.ok) throw await toAiError(res)
  const body = (await res.json()) as GeminiModelList
  const models: ModelInfo[] = (body.models ?? [])
    .filter((m) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({
      id: (m.name ?? '').replace(/^models\//, ''),
      label: m.displayName ?? (m.name ?? '').replace(/^models\//, ''),
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
    }))
  if (models.length === 0)
    throw new AiError('invalid_key', 'This key cannot use any Gemini text model.')
  return { models: rankGeminiModels(models) }
}
