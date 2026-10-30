import { describe, expect, it, vi } from 'vitest'
import { AiError, scrubSecrets } from '@/ai/errors'
import { estimateCost } from '@/ai/pricing'
import { createAdapter } from '@/ai/providers'
import { AnthropicAdapter, rankAnthropicModels, testAnthropicKey } from '@/ai/providers/anthropic'
import {
  OpenAiCompatibleAdapter,
  downgrade,
  normalizeBaseUrl,
  testOpenAiCompatible,
} from '@/ai/providers/openaiCompatible'
import type { GenerateRequest } from '@/ai/types'

const req: GenerateRequest = {
  system: 'SYSTEM',
  prompt: 'PROMPT',
  jsonSchema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] },
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

type Call = [string, RequestInit]
const callsOf = (m: { mock: { calls: unknown[][] } }) => m.mock.calls as unknown as Call[]
const bodyOf = (c: Call) => JSON.parse(String(c[1].body)) as Record<string, unknown>
const headersOf = (c: Call) => c[1].headers as Record<string, string>

describe('AnthropicAdapter', () => {
  const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123'

  it('sends the key in headers, forces the schema tool and returns the tool input as JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({
        content: [{ type: 'tool_use', name: 'emit_result', input: { a: 1 } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 120, output_tokens: 9 },
      }),
    )
    const r = await new AnthropicAdapter(KEY, 'claude-sonnet-5-5', fetchMock).generate(req)
    expect(r).toEqual({ text: '{"a":1}', tokensIn: 120, tokensOut: 9 })

    const [url, init] = callsOf(fetchMock)[0]!
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(url).not.toContain(KEY)
    const h = headersOf([url, init])
    expect(h['x-api-key']).toBe(KEY)
    expect(h['anthropic-version']).toBe('2023-06-01')
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true')
    const body = bodyOf([url, init])
    expect(body.system).toBe('SYSTEM')
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'emit_result' })
    expect((body.tools as Array<{ input_schema: unknown }>)[0]!.input_schema).toEqual(
      req.jsonSchema,
    )
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('maps errors to kinds and keeps the key out of messages', async () => {
    const cases: Array<[Response, string]> = [
      [
        json({ error: { type: 'authentication_error', message: `bad key ${KEY}` } }, 401),
        'invalid_key',
      ],
      [
        json({ error: { type: 'rate_limit_error', message: 'slow down' } }, 429, {
          'retry-after': '7',
        }),
        'rate_limited',
      ],
      [json({ error: { type: 'overloaded_error', message: 'busy' } }, 529), 'overloaded'],
      [json({ error: { type: 'invalid_request_error', message: 'nope' } }, 400), 'bad_request'],
    ]
    for (const [res, kind] of cases) {
      const err = await new AnthropicAdapter(KEY, 'm', async () => res)
        .generate(req)
        .catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AiError)
      expect((err as AiError).kind).toBe(kind)
      expect((err as AiError).message).not.toContain(KEY)
      if (kind === 'rate_limited') expect((err as AiError).retryAfterMs).toBe(7000)
    }
  })

  it('reports cut-off and refused replies', async () => {
    const cut = async () => json({ content: [], stop_reason: 'max_tokens' })
    await expect(new AnthropicAdapter(KEY, 'm', cut).generate(req)).rejects.toMatchObject({
      kind: 'truncated',
    })
    const refused = async () => json({ content: [], stop_reason: 'refusal' })
    await expect(new AnthropicAdapter(KEY, 'm', refused).generate(req)).rejects.toMatchObject({
      kind: 'blocked',
    })
  })

  it('retries once without temperature when a model refuses it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(
          { error: { type: 'invalid_request_error', message: 'temperature is not supported' } },
          400,
        ),
      )
      .mockResolvedValueOnce(
        json({ content: [{ type: 'tool_use', name: 'emit_result', input: { a: 2 } }] }),
      )
    const r = await new AnthropicAdapter(KEY, 'claude-new-model', fetchMock).generate(req)
    expect(r.text).toBe('{"a":2}')
    expect(bodyOf(callsOf(fetchMock)[0]!).temperature).toBe(0.2)
    expect(bodyOf(callsOf(fetchMock)[1]!)).not.toHaveProperty('temperature')
  })

  it('treats a failed fetch as a network error', async () => {
    const down = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(new AnthropicAdapter(KEY, 'm', down).generate(req)).rejects.toMatchObject({
      kind: 'network',
    })
  })
})

describe('testAnthropicKey', () => {
  it('lists models, Sonnet first and newest first', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({
        data: [
          {
            id: 'claude-opus-5-5',
            display_name: 'Claude Opus 5.5',
            created_at: '2026-09-01',
            type: 'model',
          },
          {
            id: 'claude-haiku-5-5',
            display_name: 'Claude Haiku 5.5',
            created_at: '2026-10-07',
            type: 'model',
          },
          {
            id: 'claude-sonnet-4-5',
            display_name: 'Claude Sonnet 4.5',
            created_at: '2025-09-29',
            type: 'model',
          },
          {
            id: 'claude-sonnet-5-5',
            display_name: 'Claude Sonnet 5.5',
            created_at: '2026-09-01',
            type: 'model',
          },
        ],
      }),
    )
    const r = await testAnthropicKey('sk-ant-xxxxxxxxxxxxxxxxxxxx', fetchMock)
    expect(r.models.map((m) => m.id)).toEqual([
      'claude-sonnet-5-5',
      'claude-sonnet-4-5',
      'claude-haiku-5-5',
      'claude-opus-5-5',
    ])
    expect(callsOf(fetchMock)[0]![0]).toBe('https://api.anthropic.com/v1/models?limit=100')
  })

  it('ranks unknown families last', () => {
    expect(
      rankAnthropicModels([
        { id: 'claude-fable-5-1', label: '' },
        { id: 'claude-haiku-5-5', label: '' },
      ]).map((m) => m.id),
    ).toEqual(['claude-haiku-5-5', 'claude-fable-5-1'])
  })

  it('rejects a bad key', async () => {
    const bad = async () =>
      json({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)
    await expect(testAnthropicKey('sk-ant-bad-key-0000000000', bad)).rejects.toMatchObject({
      kind: 'invalid_key',
    })
  })
})

describe('normalizeBaseUrl', () => {
  it('accepts https and local http, strips trailing slashes', () => {
    expect(normalizeBaseUrl('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/api/v1')
    expect(normalizeBaseUrl(' http://localhost:11434/v1 ')).toBe('http://localhost:11434/v1')
    expect(normalizeBaseUrl('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1')
  })
  it('refuses plain http to other hosts, credentials in the URL, queries and junk', () => {
    expect(normalizeBaseUrl('http://example.com/v1')).toBeNull()
    expect(normalizeBaseUrl('https://user:pass@example.com/v1')).toBeNull()
    expect(normalizeBaseUrl('https://example.com/v1?key=abc')).toBeNull()
    expect(normalizeBaseUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeBaseUrl('not a url')).toBeNull()
  })
})

describe('OpenAiCompatibleAdapter', () => {
  const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz'
  const ok = (content: string) =>
    json({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 50, completion_tokens: 5 },
    })

  it('asks for json_schema output with the bearer key', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => ok('{"a":1}'))
    const r = await new OpenAiCompatibleAdapter(
      'https://api.example.com/v1/',
      KEY,
      'gpt-x',
      fetchMock,
    ).generate(req)
    expect(r).toEqual({ text: '{"a":1}', tokensIn: 50, tokensOut: 5 })
    const call = callsOf(fetchMock)[0]!
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions')
    expect(headersOf(call).Authorization).toBe(`Bearer ${KEY}`)
    const body = bodyOf(call)
    expect(body.response_format).toMatchObject({ type: 'json_schema' })
    expect((body.messages as Array<{ role: string }>).map((m) => m.role)).toEqual([
      'system',
      'user',
    ])
  })

  it('sends no Authorization header for keyless local servers', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => ok('{"a":1}'))
    await new OpenAiCompatibleAdapter('http://localhost:11434/v1', '', 'llama', fetchMock).generate(
      req,
    )
    expect(headersOf(callsOf(fetchMock)[0]!)).not.toHaveProperty('Authorization')
  })

  it('steps down json_schema → json_object → schema in the prompt, and remembers it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ error: { message: "Unsupported value: 'response_format.type' json_schema" } }, 400),
      )
      .mockResolvedValueOnce(
        json({ error: { message: 'response_format json_object is not supported' } }, 400),
      )
      .mockResolvedValueOnce(ok('{"a":3}'))
      .mockResolvedValueOnce(ok('{"a":4}'))
    const adapter = new OpenAiCompatibleAdapter('https://weird.example/v1', KEY, 'tiny', fetchMock)
    expect((await adapter.generate(req)).text).toBe('{"a":3}')
    const bodies = callsOf(fetchMock).map(bodyOf)
    expect(bodies[0]!.response_format).toMatchObject({ type: 'json_schema' })
    expect(bodies[1]!.response_format).toEqual({ type: 'json_object' })
    expect(bodies[2]).not.toHaveProperty('response_format')
    const system = (bodies[2]!.messages as Array<{ content: string }>)[0]!.content
    expect(system).toContain('JSON Schema')
    // Second call goes straight to what worked.
    await adapter.generate(req)
    expect(bodyOf(callsOf(fetchMock)[3]!)).not.toHaveProperty('response_format')
  })

  it('switches to max_completion_tokens and drops temperature when asked', () => {
    const caps = {
      mode: 'json_schema' as const,
      temperature: true,
      maxTokensField: 'max_tokens' as const,
    }
    expect(downgrade(caps, "Unsupported parameter: 'temperature'")).toMatchObject({
      temperature: false,
    })
    expect(
      downgrade(
        { ...caps, temperature: false },
        "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
      ),
    ).toMatchObject({ maxTokensField: 'max_completion_tokens' })
    expect(downgrade({ ...caps, mode: 'none' }, 'something else')).toBeNull()
  })

  it('reports a blocked or unreachable endpoint as unreachable, not a key problem', async () => {
    const cors = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(
      new OpenAiCompatibleAdapter('https://no-cors.example/v1', KEY, 'm', cors).generate(req),
    ).rejects.toMatchObject({ kind: 'unreachable' })
  })

  it('maps finish reasons and HTTP errors', async () => {
    const cut = async () =>
      json({ choices: [{ message: { content: '{"a"' }, finish_reason: 'length' }] })
    await expect(
      new OpenAiCompatibleAdapter('https://x.example', KEY, 'm', cut).generate(req),
    ).rejects.toMatchObject({ kind: 'truncated' })
    const filtered = async () =>
      json({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] })
    await expect(
      new OpenAiCompatibleAdapter('https://x.example', KEY, 'm', filtered).generate(req),
    ).rejects.toMatchObject({ kind: 'blocked' })
    const limited = async () =>
      json({ error: { message: 'Rate limit reached' } }, 429, { 'retry-after': '3' })
    await expect(
      new OpenAiCompatibleAdapter('https://x.example', KEY, 'm', limited).generate(req),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 3000 })
    const denied = async () =>
      json({ error: { message: `Incorrect API key provided: ${KEY}` } }, 401)
    const err = (await new OpenAiCompatibleAdapter('https://x.example', KEY, 'm', denied)
      .generate(req)
      .catch((e: unknown) => e)) as AiError
    expect(err.kind).toBe('invalid_key')
    expect(err.message).not.toContain(KEY)
  })

  it('refuses endpoint addresses that are not allowed', () => {
    expect(() => new OpenAiCompatibleAdapter('http://evil.example/v1', KEY, 'm')).toThrow(AiError)
  })
})

describe('testOpenAiCompatible', () => {
  it('lists models from /models', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ data: [{ id: 'b-model', context_length: 32000 }, { id: 'a-model' }] }),
    )
    const r = await testOpenAiCompatible(
      'https://router.example/v1',
      'k-123456789',
      undefined,
      fetchMock,
    )
    expect(r.models.map((m) => m.id)).toEqual(['a-model', 'b-model'])
    expect(r.models[1]!.inputTokenLimit).toBe(32000)
  })

  it('falls back to a tiny completion when /models is missing and a model is named', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }),
      )
    const r = await testOpenAiCompatible('http://localhost:1234/v1', '', 'local-7b', fetchMock)
    expect(r.models).toEqual([{ id: 'local-7b', label: 'local-7b' }])
    expect(callsOf(fetchMock)[1]![0]).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('asks for a model name when the endpoint has no model list', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('nope', { status: 404 }))
    await expect(
      testOpenAiCompatible('https://x.example/v1', '', undefined, fetchMock),
    ).rejects.toMatchObject({
      kind: 'bad_request',
    })
  })
})

describe('createAdapter', () => {
  it('builds the right adapter for each provider', () => {
    expect(
      createAdapter({ provider: 'gemini', apiKey: 'AIza-test-key-000000000', model: 'g' }).provider,
    ).toBe('gemini')
    expect(
      createAdapter({ provider: 'anthropic', apiKey: 'sk-ant-test-000000000', model: 'c' })
        .provider,
    ).toBe('anthropic')
    expect(
      createAdapter({
        provider: 'openai_compatible',
        apiKey: '',
        model: 'o',
        baseUrl: 'https://x.example/v1',
      }).provider,
    ).toBe('openai_compatible')
    expect(() => createAdapter({ provider: 'openai_compatible', apiKey: '', model: 'o' })).toThrow(
      AiError,
    )
  })
})

describe('estimateCost', () => {
  it('is free for Gemini, priced for known Claude models, unknown otherwise', () => {
    expect(estimateCost('gemini', 'gemini-3.8-flash', 1e6, 1e6)).toEqual({ kind: 'free' })
    const sonnet = estimateCost('anthropic', 'claude-sonnet-5-5', 1_000_000, 100_000)
    expect(sonnet).toEqual({ kind: 'paid', usd: 3 })
    expect(estimateCost('anthropic', 'claude-mystery', 1, 1)).toEqual({ kind: 'unknown' })
    expect(estimateCost('openai_compatible', 'gpt-x', 1, 1)).toEqual({ kind: 'unknown' })
  })
})

describe('key scrubbing covers new key formats', () => {
  it('hides Anthropic and OpenAI project keys', () => {
    const text = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz and sk-proj-abcdefghijklmnopqrstu'
    expect(scrubSecrets(text)).not.toMatch(/sk-(ant|proj)-[a-z]{6}/)
  })
})

describe('pickKey (default provider)', async () => {
  const { pickKey } = await import('@/features/settings/aiKeyStore')
  const k = (provider: 'gemini' | 'anthropic' | 'openai_compatible') => ({
    provider,
    apiKey: 'x'.repeat(12),
    model: 'm',
    remembered: true,
    testedAt: '2026-10-30',
  })
  it('uses the chosen default, else the first provider set up', () => {
    expect(pickKey({ anthropic: k('anthropic'), gemini: k('gemini') }, 'anthropic')?.provider).toBe(
      'anthropic',
    )
    expect(pickKey({ anthropic: k('anthropic') }, 'gemini')?.provider).toBe('anthropic')
    expect(
      pickKey({ openai_compatible: k('openai_compatible'), gemini: k('gemini') }, null)?.provider,
    ).toBe('gemini')
    expect(pickKey({}, 'gemini')).toBeNull()
  })
})
