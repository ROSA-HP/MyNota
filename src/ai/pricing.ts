import type { AiProvider } from '@/lib/database.types'

/**
 * Rough prices for the cost estimate shown before a build. Prices change often, so these are
 * labelled "estimate" in the UI and only cover model families we know. Unknown models show
 * tokens without a price. Free Gemini keys cost nothing (within Google's limits).
 *
 * USD per million tokens. Checked 2026-10-30 (Claude 5.5 family, launch pricing as reported;
 * Haiku 5.5 uses its under-100K-tokens rate, which is what a single section request is).
 */
interface Price {
  input: number
  output: number
}

const ANTHROPIC: Array<[RegExp, Price]> = [
  [/haiku-5/, { input: 0.1, output: 0.5 }],
  [/sonnet-5/, { input: 2, output: 10 }],
  [/opus-5/, { input: 4, output: 20 }],
  [/haiku-4/, { input: 1, output: 5 }],
]

export type CostEstimate = { kind: 'free' } | { kind: 'paid'; usd: number } | { kind: 'unknown' }

export function estimateCost(
  provider: AiProvider,
  model: string,
  tokensIn: number,
  tokensOut: number,
): CostEstimate {
  if (provider === 'gemini') return { kind: 'free' }
  if (provider === 'anthropic') {
    const price = ANTHROPIC.find(([re]) => re.test(model))?.[1]
    if (!price) return { kind: 'unknown' }
    return { kind: 'paid', usd: (tokensIn * price.input + tokensOut * price.output) / 1_000_000 }
  }
  return { kind: 'unknown' }
}
