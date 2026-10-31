import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resultsTable, runSample, type Sample, type SampleResult } from '@/ai/eval/run'
import { createAdapter } from '@/ai/providers'
import type { AiProvider } from '@/lib/database.types'

/**
 * Prompt test set (Phase 7.7, docs/ai-pipeline.md › Prompt quality testing). Runs only when a
 * key is given, with your own key, and never in CI:
 *
 *   MYNOTA_EVAL_PROVIDER=gemini MYNOTA_EVAL_MODEL=gemini-2.5-flash MYNOTA_EVAL_KEY=... npm run eval:prompts
 *
 * Optional: MYNOTA_EVAL_BASE_URL (OpenAI-compatible), MYNOTA_EVAL_ONLY=bio-cells-en,notes-…
 * Results go to tests/prompt-set/results/ (Markdown + JSON, no key) and feed
 * src/ai/recommended.ts.
 */

const provider = process.env.MYNOTA_EVAL_PROVIDER as AiProvider | undefined
const model = process.env.MYNOTA_EVAL_MODEL ?? ''
const apiKey = process.env.MYNOTA_EVAL_KEY ?? ''
const only = (process.env.MYNOTA_EVAL_ONLY ?? '').split(',').filter(Boolean)

const dir = join(import.meta.dirname, 'samples')
const samples: Sample[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Sample)
  .filter((s) => !only.length || only.includes(s.id))

describe.skipIf(!provider || !model || !apiKey)('prompt test set', () => {
  it(`${provider ?? '?'} / ${model}`, async () => {
    const adapter = createAdapter({
      provider: provider as AiProvider,
      model,
      apiKey,
      baseUrl: process.env.MYNOTA_EVAL_BASE_URL,
    })
    const results: SampleResult[] = []
    for (const s of samples) {
      const r = await runSample(adapter, s)
      results.push(r)
      const note = r.outlineError ? ` (outline failed: ${r.outlineError})` : ''
      process.stdout.write(`${s.id}: score ${r.report.score}${note}\n`)
    }
    const table = resultsTable(`${provider} / ${model}`, results)
    process.stdout.write(`\n${table}\n\n`)
    const out = join(import.meta.dirname, 'results')
    mkdirSync(out, { recursive: true })
    const name = `${new Date().toISOString().slice(0, 10)}-${provider}-${model.replace(/[^\w.-]/g, '_')}`
    writeFileSync(join(out, `${name}.md`), `${table}\n`)
    writeFileSync(
      join(out, `${name}.json`),
      JSON.stringify({ provider, model, date: new Date().toISOString(), results }, null, 2),
    )
    expect(results).toHaveLength(samples.length)
  })
})
