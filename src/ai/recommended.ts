import type { AiProvider } from '@/lib/database.types'

/**
 * Models checked with the prompt test set (Phase 7.7, docs/ai-pipeline.md › Prompt quality
 * testing; run `npm run eval:prompts`, results in tests/prompt-set/results/). Settings shows
 * them under each provider. Only add a model after a run: the score is the run's average
 * (0-100: coverage, faithfulness, visual rules), together with the date and prompt versions.
 */
export interface TestedModel {
  provider: AiProvider
  model: string
  score: number
  /** YYYY-MM-DD of the run. */
  checked: string
  prompts: string
}

export const TESTED_MODELS: readonly TestedModel[] = [
  // Empty until the first run with real keys; see docs/launch.md.
]

export const testedFor = (provider: AiProvider): TestedModel[] =>
  TESTED_MODELS.filter((m) => m.provider === provider).sort((a, b) => b.score - a.score)
