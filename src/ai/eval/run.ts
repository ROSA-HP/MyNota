import { toProviderSchema } from '@/ai/jsonSchema'
import { outlineText } from '@/ai/pipeline/convert'
import { splitParagraphs } from '@/ai/pipeline/prepare'
import { DETAILS_PROMPT_VERSION, detailsPrompt } from '@/ai/prompts/details.v2'
import { OUTLINE_PROMPT_VERSION, outlinePrompt } from '@/ai/prompts/outline.v2'
import { SYSTEM_PROMPT, versionFor, type SourceMode } from '@/ai/prompts/shared'
import { DetailsResponseSchema, detailsSchemaFor } from '@/ai/schemas/details'
import { OutlineResponseSchema, normalizeOutline, outlineSchemaFor } from '@/ai/schemas/outline'
import { generateStructured } from '@/ai/structured'
import type { ProviderAdapter } from '@/ai/types'
import { scoreRun, type QualityReport, type SectionResult } from './quality'

/** One item of the prompt test set (tests/prompt-set/*.json). */
export interface Sample {
  id: string
  title: string
  subject: string
  language: 'en' | 'de' | 'ar'
  mode: SourceMode
  text: string
}

export interface SampleResult {
  id: string
  language: string
  mode: SourceMode
  prompts: string[]
  tokensIn: number
  tokensOut: number
  seconds: number
  outlineError?: string
  report: QualityReport
}

/**
 * Builds one sample the way the app does (outline pass, then a details pass per section) and
 * scores the raw output. Sections run one after another: the test set is small and free keys
 * have tight limits.
 */
export async function runSample(adapter: ProviderAdapter, sample: Sample): Promise<SampleResult> {
  const started = Date.now()
  const paragraphs = splitParagraphs(sample.text)
  const prompts = [
    versionFor(OUTLINE_PROMPT_VERSION, sample.mode),
    versionFor(DETAILS_PROMPT_VERSION, sample.mode),
  ]
  let tokensIn = 0
  let tokensOut = 0
  const done = (report: QualityReport, outlineError?: string): SampleResult => ({
    id: sample.id,
    language: sample.language,
    mode: sample.mode,
    prompts,
    tokensIn,
    tokensOut,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    ...(outlineError ? { outlineError } : {}),
    report,
  })

  let outline
  try {
    const r = await generateStructured({
      adapter,
      system: SYSTEM_PROMPT,
      prompt: outlinePrompt({
        chapterTitle: sample.title,
        sourceLanguage: sample.language,
        paragraphs,
        mode: sample.mode,
      }),
      schema: outlineSchemaFor(paragraphs.length),
      jsonSchema: toProviderSchema(OutlineResponseSchema),
    })
    tokensIn += r.tokensIn ?? 0
    tokensOut += r.tokensOut ?? 0
    outline = r.data
  } catch (e) {
    return done(scoreRun(paragraphs.length, null, []), e instanceof Error ? e.message : String(e))
  }

  // The app works on the normalized outline (no gaps); scoring uses the same ranges.
  const normalized = normalizeOutline(outline, paragraphs.length)
  const sections: SectionResult[] = []
  for (const s of normalized.sections) {
    const own = paragraphs.filter((p) => p.n >= s.paragraphs.from && p.n <= s.paragraphs.to)
    try {
      const r = await generateStructured({
        adapter,
        system: SYSTEM_PROMPT,
        prompt: detailsPrompt({
          bookTitle: sample.title,
          chapterTitle: sample.title,
          outline: outlineText(normalized),
          sectionTitle: s.title,
          shape: s.shape,
          sourceLanguage: sample.language,
          explanationLanguage: sample.language,
          detailLevel: 'standard',
          paragraphs: own,
          mode: sample.mode,
        }),
        schema: detailsSchemaFor(paragraphs.length),
        jsonSchema: toProviderSchema(DetailsResponseSchema),
      })
      tokensIn += r.tokensIn ?? 0
      tokensOut += r.tokensOut ?? 0
      sections.push({ title: s.title, paragraphs: s.paragraphs, details: r.data })
    } catch (e) {
      sections.push({
        title: s.title,
        paragraphs: s.paragraphs,
        details: null,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  // Outline style warnings are about the model's own outline, not the normalized one.
  return done(scoreRun(paragraphs.length, outline, sections))
}

/** A short Markdown table for the results file and the console. */
export function resultsTable(model: string, results: SampleResult[]): string {
  const rows = results.map(
    (r) =>
      `| ${r.id} | ${r.language} | ${r.report.score} | ${Math.round(r.report.coverage * 100)}% | ${r.report.unsourced} | ${r.report.outOfRange} | ${r.report.flatSections} | ${r.report.relations} | ${r.report.failedSections + (r.outlineError ? 1 : 0)} | ${r.seconds}s |`,
  )
  const avg = results.length
    ? Math.round(results.reduce((n, r) => n + r.report.score, 0) / results.length)
    : 0
  return [
    `### ${model}: average score ${avg}`,
    '',
    '| Sample | Lang | Score | Coverage | Unsourced | Out of range | Flat sections | Links | Failed | Time |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n')
}
