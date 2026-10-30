import type { Paragraph } from '@/ai/prompts/shared'

/** Passed from the new-map flow to the workspace (router state) to start building. */
export interface BuildRequest {
  rootId: string
  title: string
  paragraphs: Paragraph[]
  sourceLanguage: string | null
  explanationLanguage: string | null
  detailLevel: 'brief' | 'standard' | 'detailed'
}
