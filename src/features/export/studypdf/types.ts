import type { ChapterColor, DetailBlock, Importance, NodeType } from '@/lib/database.types'
import type { VectorMapPageData } from '../mindmapSvg'
import type { OutlineItem } from '../outline'
import type { ExportWarning } from './cleanup'

export type Paper =
  | 'a4-mixed'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'letter-mixed'
  | 'letter-portrait'
  | 'letter-landscape'

export type PageKind = 'cover' | 'toc' | 'map' | 'notes' | 'cards' | 'answers'

export type StudyPreset = 'notes' | 'summary' | 'cards' | 'maps'

export type PaperTone = 'mint' | 'white'

export interface StudyInclude {
  links: boolean
  cards: boolean
  sources: boolean
  aiTags: boolean
}

export type StatKey = 'chapters' | 'sections' | 'blocks' | 'formulas' | 'cards'

export interface StudyLabels {
  madeWith: string
  contents: string
  whatsInside?: string
  chapter: string
  chapterShort: (n: number) => string
  continued: string
  addedByAi: string
  flashcards: string
  answers: string
  q: string
  a: string
  page: (n: number) => string
  more: (count: number) => string
  importance: { core: string; extra: string }
  kind: { book: string; notes: string; blank: string }
  sticker: { notes: string; summary: string; cards: string; maps: string }
  stats: { chapters: string; sections: string; blocks: string; formulas: string; cards: string }
  statLabel?: (key: StatKey, count: number) => string
  types: Record<NodeType, string>
  empty: string
}

export interface StudyPdfInput {
  title: string
  kind: 'book' | 'notes' | 'blank'
  dateLabel: string
  preset: StudyPreset
  paper: Paper
  tone: PaperTone
  dir: 'ltr' | 'rtl'
  lang?: 'en' | 'de' | 'ar'
  items: OutlineItem[]
  mapPages?: VectorMapPageData[]
  include: StudyInclude
  answersAtEnd: boolean
  labels: StudyLabels
  signal?: AbortSignal
  onProgress?: (p: { phase: 'prepare' | 'page'; done: number; total: number }) => void
  onWarnings?: (warnings: ExportWarning[]) => void
}

export type BlockRow =
  | { kind: 'summary'; text: string }
  | { kind: 'detail'; detail: DetailBlock }
  | { kind: 'link'; label: string; other: string; outgoing: boolean }
  | { kind: 'source'; page: number }
  | { kind: 'cardsHead' }
  | { kind: 'card'; front: string; back: string }

export interface ChapterUnit {
  kind: 'chapter'
  id: string
  number: number
  title: string
  summary: string
  color: ChapterColor
  dir: 'ltr' | 'rtl'
}

export interface SectionUnit {
  kind: 'section'
  id: string
  label: string
  title: string
  summary: string
  color: ChapterColor
  dir: 'ltr' | 'rtl'
}

export interface BlockUnit {
  kind: 'block'
  id: string
  relDepth: 0 | 1 | 2 | 3
  parentTitle?: string
  title: string
  type: NodeType | null
  importance: Importance
  color: ChapterColor
  dir: 'ltr' | 'rtl'
  aiAdded: boolean
  rows: BlockRow[]
}

export type FlowUnit = ChapterUnit | SectionUnit | BlockUnit

export interface CardTile {
  n: number
  front: string
  back: string
  title: string
  color: ChapterColor
  dir: 'ltr' | 'rtl'
}

export interface TocEntry {
  unitIndex: number
  level: 'chapter' | 'section'
  label: string
  title: string
  color: ChapterColor
  dir: 'ltr' | 'rtl'
}

export interface CoverOutlineChapter {
  number: number | null
  title: string
  summary?: string
  color: ChapterColor
  dir: 'ltr' | 'rtl'
  sections: Array<{
    label: string
    title: string
    summary?: string
    dir: 'ltr' | 'rtl'
    unitIndex?: number
    page?: number
  }>
}

export interface StudyDoc {
  title: string
  kind: 'book' | 'notes' | 'blank'
  preset: StudyPreset
  dir: 'ltr' | 'rtl'
  singleChapterCollapsed: boolean
  flow: FlowUnit[]
  toc: TocEntry[]
  tiles: CardTile[]
  tabs: Array<{ number: number; title: string; color: ChapterColor }>
  coverOutline: CoverOutlineChapter[]
  stats: { chapters: number; sections: number; blocks: number; formulas: number; cards: number }
}

export interface MeasuredUnit {
  height: number
  padTop: number
  keepWithNext: number
  split: null | { head: number; rows: number[]; base: number; gap: number }
}

export interface Placed {
  unitIndex: number
  rowFrom: number
  rowTo: number
  continued: boolean
}

export interface NotesPage {
  placed: Placed[]
  usedHeight?: number
}
