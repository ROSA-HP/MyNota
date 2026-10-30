import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AiError, registerSecret, scrubSecrets } from '@/ai/errors'
import { toProviderSchema } from '@/ai/jsonSchema'
import { GeminiAdapter, rankGeminiModels, testGeminiKey } from '@/ai/providers/gemini'
import { AiQueue } from '@/ai/queue'
import { describeIssues, extractJson, generateStructured } from '@/ai/structured'
import type { GenerateRequest, ProviderAdapter } from '@/ai/types'
import { DetailsResponseSchema } from '@/ai/schemas/details'

const Schema = z.object({ items: z.array(z.object({ title: z.string().min(1) })).min(1) })

function fakeAdapter(replies: string[]): ProviderAdapter & { calls: GenerateRequest[] } {
  const calls: GenerateRequest[] = []
  return {
    provider: 'gemini',
    model: 'test',
    calls,
    async generate(req) {
      calls.push(req)
      const text = replies.shift()
      if (text === undefined) throw new Error('no more replies')
      return { text, tokensIn: 100, tokensOut: 20 }
    },
  }
}

describe('extractJson', () => {
  it('reads plain JSON, fenced JSON and JSON with chatter around it', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Sure! Here it is: {"a":1} Hope this helps.')).toEqual({ a: 1 })
  })
  it('throws on non-JSON', () => {
    expect(() => extractJson('no json here')).toThrow(SyntaxError)
  })
})

describe('generateStructured (one repair retry)', () => {
  const base = { system: 'sys', prompt: 'PROMPT', schema: Schema, jsonSchema: {} }

  it('returns the first valid reply without retrying', async () => {
    const adapter = fakeAdapter(['{"items":[{"title":"A"}]}'])
    const r = await generateStructured({ ...base, adapter })
    expect(r).toMatchObject({
      attempts: 1,
      tokensIn: 100,
      tokensOut: 20,
      data: { items: [{ title: 'A' }] },
    })
    expect(adapter.calls).toHaveLength(1)
  })

  it('retries once with the validation errors and the previous reply', async () => {
    const adapter = fakeAdapter(['{"items":[{"title":""}]}', '{"items":[{"title":"Fixed"}]}'])
    const r = await generateStructured({ ...base, adapter })
    expect(r.attempts).toBe(2)
    expect(r.tokensIn).toBe(200)
    const repair = adapter.calls[1]!.prompt
    expect(repair.startsWith('PROMPT')).toBe(true)
    expect(repair).toContain('YOUR PREVIOUS REPLY\n{"items":[{"title":""}]}')
    expect(repair).toMatch(/items\.0\.title:/)
  })

  it('also repairs replies that are not JSON at all', async () => {
    const adapter = fakeAdapter(['I cannot do that', '{"items":[{"title":"B"}]}'])
    const r = await generateStructured({ ...base, adapter })
    expect(r.attempts).toBe(2)
    expect(adapter.calls[1]!.prompt).toContain('not valid JSON')
  })

  it('gives up after the second invalid reply with invalid_output', async () => {
    const adapter = fakeAdapter(['{}', '{"items":[]}'])
    await expect(generateStructured({ ...base, adapter })).rejects.toMatchObject({
      kind: 'invalid_output',
    })
    expect(adapter.calls).toHaveLength(2)
  })

  it('issue descriptions cap at 12 lines', () => {
    const big = z.object({ a: z.array(z.string()) }).safeParse({ a: Array(30).fill(1) })
    expect(describeIssues(big.error!).split('\n')).toHaveLength(12)
  })
})

describe('AiQueue', () => {
  const instantSleep = vi.fn(async () => undefined)

  it('retries rate limits using the provider retry delay, then succeeds', async () => {
    const waits: number[] = []
    const q = new AiQueue({
      concurrency: 1,
      sleep: instantSleep,
      now: () => 0,
      onWait: (_id, until) => waits.push(until),
    })
    let n = 0
    const r = await q.run('t', async () => {
      if (n++ < 2) throw new AiError('rate_limited', 'slow down', { retryAfterMs: 24000 })
      return 'ok'
    })
    expect(r).toBe('ok')
    expect(waits).toEqual([24250, 24250])
  })

  it('uses exponential backoff with jitter when no retry delay is given', () => {
    const q = new AiQueue({
      concurrency: 1,
      random: () => 0.5,
      baseDelayMs: 2000,
      maxDelayMs: 60000,
    })
    const e = new AiError('overloaded', 'busy')
    expect([0, 1, 2, 3, 6].map((a) => q.backoffMs(a, e))).toEqual([2000, 4000, 8000, 16000, 60000])
  })

  it('does not retry non-retryable errors', async () => {
    const q = new AiQueue({ concurrency: 1, sleep: instantSleep })
    const fn = vi.fn(async () => {
      throw new AiError('invalid_key', 'bad key')
    })
    await expect(q.run('t', fn)).rejects.toMatchObject({ kind: 'invalid_key' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('stops after maxRetries', async () => {
    const q = new AiQueue({ concurrency: 1, sleep: instantSleep, maxRetries: 2 })
    const fn = vi.fn(async () => {
      throw new AiError('rate_limited', 'again')
    })
    await expect(q.run('t', fn)).rejects.toMatchObject({ kind: 'rate_limited' })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('never runs more than `concurrency` tasks at once', async () => {
    const q = new AiQueue({ concurrency: 2 })
    let active = 0
    let peak = 0
    const task = () =>
      q.run('t', async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active--
      })
    await Promise.all([task(), task(), task(), task(), task()])
    expect(peak).toBe(2)
  })

  it('aborting stops waiting tasks', async () => {
    const q = new AiQueue({ concurrency: 1 })
    const ctrl = new AbortController()
    const slow = q.run('a', () => new Promise((r) => setTimeout(r, 20)))
    const queued = q.run('b', async () => 'never', ctrl.signal)
    ctrl.abort()
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    await slow
  })
})

describe('scrubSecrets', () => {
  it('removes registered keys and anything shaped like a provider key', () => {
    registerSecret('my-custom-secret-123')
    const text =
      'key my-custom-secret-123 and AIza' +
      'A'.repeat(35) +
      ' and sk-' +
      'b'.repeat(40) +
      ' x-goog-api-key: abcdefghijklmnop'
    const out = scrubSecrets(text)
    expect(out).not.toContain('my-custom-secret-123')
    expect(out).not.toMatch(/AIza[A]{20}/)
    expect(out).not.toMatch(/sk-b{20}/)
    expect(out).not.toContain('abcdefghijklmnop')
  })

  it('AiError messages are scrubbed automatically', () => {
    const e = new AiError('bad_request', 'API key AIza' + 'Z'.repeat(35) + ' is invalid')
    expect(e.message).not.toMatch(/AIzaZ{10}/)
  })
})

describe('toProviderSchema', () => {
  it('produces plain JSON Schema with nullable as a type array and no unsupported keywords', () => {
    const s = toProviderSchema(DetailsResponseSchema) as {
      properties: {
        blocks: {
          items: { properties: Record<string, Record<string, unknown>>; required: string[] }
        }
      }
    }
    const block = s.properties.blocks.items
    expect(block.properties.parent!.type).toEqual(['string', 'null'])
    expect(block.required).toEqual(
      expect.arrayContaining(['key', 'parent', 'title', 'details', 'source', 'added']),
    )
    const json = JSON.stringify(s)
    expect(json).not.toMatch(/"(maxItems|maxLength|minLength|default|\$schema)"/)
  })
})

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('GeminiAdapter', () => {
  const KEY = 'AIza' + 'k'.repeat(35)
  const req: GenerateRequest = { system: 'SYS', prompt: 'PROMPT', jsonSchema: { type: 'object' } }

  it('sends the key in a header, never in the URL, and asks for JSON with the schema', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, {
        candidates: [
          {
            content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"ok":true}' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 5 },
      }),
    )
    const r = await new GeminiAdapter(KEY, 'gemini-x', fetchMock).generate(req)
    expect(r).toEqual({ text: '{"ok":true}', tokensIn: 50, tokensOut: 15 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent',
    )
    expect(String(url)).not.toContain(KEY)
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY)
    const body = JSON.parse(String(init?.body))
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
      temperature: 0.2,
    })
    expect(body.systemInstruction.parts[0].text).toBe('SYS')
  })

  it('maps 429 with RetryInfo to a rate_limited error with the delay', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(429, {
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'Quota exceeded',
          details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '24s' }],
        },
      }),
    )
    await expect(new GeminiAdapter(KEY, 'm', fetchMock).generate(req)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: 24000,
    })
  })

  it('maps an invalid key to invalid_key', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(400, {
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'API key not valid. Please pass a valid API key.',
        },
      }),
    )
    await expect(new GeminiAdapter(KEY, 'm', fetchMock).generate(req)).rejects.toMatchObject({
      kind: 'invalid_key',
    })
  })

  it('maps 503 to overloaded (retryable) and MAX_TOKENS to truncated', async () => {
    const busy = vi.fn(async () =>
      jsonResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } }),
    )
    const e = await new GeminiAdapter(KEY, 'm', busy).generate(req).catch((x: AiError) => x)
    expect(e).toMatchObject({ kind: 'overloaded' })
    expect((e as AiError).retryable).toBe(true)

    const cut = vi.fn(async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }],
      }),
    )
    await expect(new GeminiAdapter(KEY, 'm', cut).generate(req)).rejects.toMatchObject({
      kind: 'truncated',
    })
  })

  it('retries without temperature when a model refuses it, and remembers that', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message: 'temperature is not supported for this model',
          },
        }),
      )
      .mockImplementation(async () =>
        jsonResponse(200, {
          candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }],
        }),
      )
    const a = new GeminiAdapter(KEY, 'no-temp-model', fetchMock)
    await a.generate(req)
    await a.generate(req)
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)).generationConfig)
    expect(bodies[0].temperature).toBe(0.2)
    expect(bodies[1].temperature).toBeUndefined()
    expect(bodies[2].temperature).toBeUndefined()
  })

  it('network failures become retryable network errors without leaking the key', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError(`Failed to fetch with ${KEY}`)
    })
    const e = await new GeminiAdapter(KEY, 'm', fetchMock).generate(req).catch((x: AiError) => x)
    expect(e).toMatchObject({ kind: 'network' })
    expect((e as AiError).message).not.toContain(KEY)
  })
})

describe('testGeminiKey', () => {
  it('lists usable text models with the recommended ones first', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        models: [
          { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
          {
            name: 'models/gemini-9-image-preview',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-3.5-flash-lite',
            displayName: 'Gemini 3.5 Flash-Lite',
            supportedGenerationMethods: ['generateContent'],
            inputTokenLimit: 1000000,
          },
          {
            name: 'models/gemini-3.8-flash',
            displayName: 'Gemini 3.8 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    )
    const r = await testGeminiKey('AIza' + 'q'.repeat(35), fetchMock)
    expect(r.models.map((m) => m.id)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-9-image-preview',
    ])
    expect(r.models[1]?.inputTokenLimit).toBe(1000000)
  })

  it('a rejected key throws invalid_key', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'denied' } }),
    )
    await expect(testGeminiKey('AIza' + 'q'.repeat(35), fetchMock)).rejects.toMatchObject({
      kind: 'invalid_key',
    })
  })

  it('ranks unknown flash models above previews', () => {
    const r = rankGeminiModels([
      { id: 'gemini-x-pro-preview', label: '' },
      { id: 'gemini-x-flash', label: '' },
      { id: 'gemini-x-pro', label: '' },
    ])
    expect(r.map((m) => m.id)).toEqual(['gemini-x-flash', 'gemini-x-pro', 'gemini-x-pro-preview'])
  })
})
