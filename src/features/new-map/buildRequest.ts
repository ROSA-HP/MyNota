import type { Paragraph } from '@/ai/prompts/shared'
import type { AiProvider } from '@/lib/database.types'

/** Passed from the new-map flow to the workspace (router state) to start building. */
export interface BuildRequest {
  rootId: string
  title: string
  paragraphs: Paragraph[]
  sourceLanguage: string | null
  explanationLanguage: string | null
  detailLevel: 'brief' | 'standard' | 'detailed'
  /** The provider chosen for this map; its key comes from this device's key store. */
  provider: AiProvider
}
