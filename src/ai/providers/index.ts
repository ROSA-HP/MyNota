import type { AiProvider } from '@/lib/database.types'
import { AiError } from '../errors'
import type { KeyTestResult, ProviderAdapter } from '../types'
import { AnthropicAdapter, testAnthropicKey } from './anthropic'
import { GeminiAdapter, testGeminiKey } from './gemini'
import { OpenAiCompatibleAdapter, testOpenAiCompatible } from './openaiCompatible'

/** What an adapter needs: the provider, the key (empty for keyless local servers), the model. */
export interface ProviderCredentials {
  provider: AiProvider
  apiKey: string
  model: string
  /** OpenAI-compatible only. */
  baseUrl?: string
}

export const PROVIDERS: readonly AiProvider[] = ['gemini', 'anthropic', 'openai_compatible']

/** Where students get a key. */
export const KEY_URLS: Partial<Record<AiProvider, string>> = {
  gemini: 'https://aistudio.google.com/apikey',
  anthropic: 'https://console.anthropic.com/settings/keys',
}

export function createAdapter(c: ProviderCredentials): ProviderAdapter {
  switch (c.provider) {
    case 'gemini':
      return new GeminiAdapter(c.apiKey, c.model)
    case 'anthropic':
      return new AnthropicAdapter(c.apiKey, c.model)
    case 'openai_compatible':
      if (!c.baseUrl) throw new AiError('bad_request', 'The endpoint address is missing.')
      return new OpenAiCompatibleAdapter(c.baseUrl, c.apiKey, c.model)
  }
}

/** "Test key" for any provider: proves the key works and returns the models it can use. */
export function testProvider(
  c: Omit<ProviderCredentials, 'model'> & { model?: string },
  signal?: AbortSignal,
): Promise<KeyTestResult> {
  switch (c.provider) {
    case 'gemini':
      return testGeminiKey(c.apiKey, undefined, signal)
    case 'anthropic':
      return testAnthropicKey(c.apiKey, undefined, signal)
    case 'openai_compatible':
      return testOpenAiCompatible(c.baseUrl ?? '', c.apiKey, c.model, undefined, signal)
  }
}
