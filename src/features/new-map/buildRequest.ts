import type { Paragraph, SourceMode } from '@/ai/prompts/shared'
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
  /** Lecture notes get the notes-mode rules; pasted textbook text does not. */
  mode?: SourceMode
}

/**
 * A book: chapters to build now, by chapter node id. Their paragraphs are read from the map's
 * sources when the workspace opens (they are already saved), so nothing large goes in router state.
 */
export interface BookBuildRequest {
  book: true
  chapterIds: string[]
  bookTitle: string
  sourceLanguage: string | null
  explanationLanguage: string | null
  detailLevel: 'brief' | 'standard' | 'detailed'
  provider: AiProvider
}
