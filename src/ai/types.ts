import type { AiProvider } from '@/lib/database.types'

export interface ModelInfo {
  id: string
  label: string
  /** Max input tokens, used to decide whether a text fits in one request. */
  inputTokenLimit?: number
  outputTokenLimit?: number
}

export interface GenerateRequest {
  system: string
  prompt: string
  /** JSON Schema for structured output (see toProviderSchema). */
  jsonSchema: Record<string, unknown>
  maxOutputTokens?: number
  signal?: AbortSignal
}

export interface GenerateResult {
  text: string
  tokensIn?: number
  tokensOut?: number
}

/** One adapter per provider. All calls go from the browser straight to the provider. */
export interface ProviderAdapter {
  readonly provider: AiProvider
  readonly model: string
  generate(req: GenerateRequest): Promise<GenerateResult>
}

export interface KeyTestResult {
  models: ModelInfo[]
}
