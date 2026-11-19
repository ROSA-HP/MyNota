import type { CSSProperties } from 'react'
import type { ChapterColor } from '@/lib/database.types'
import type { PageKind, Paper } from './types'

export const COLORS = {
  mintFrost: '#F1FCF9',
  white: '#FFFFFF',
  bioSlate: '#EBF6F4',
  parchment: '#EDE8DC',
  surgicalTeal: '#1D635D',
  cyanGlow: '#ADEFE7',
  ink: '#121C1B',
  charcoal: '#2F3A38',
  legendText: '#1A2423',
  softPeach: '#FE9572',
} as const

export const CHAPTER_FILL: Record<ChapterColor, string> = {
  yellow: '#FDE68A',
  coral: '#FFA38F',
  sky: '#A5D8FF',
  mint: '#A7F0CF',
  lavender: '#C9B8FF',
  pink: '#FBB0D8',
  orange: '#FDBE7F',
  lime: '#D4F59A',
}

export const FONT_LATIN = "'Space Grotesk', 'IBM Plex Sans Arabic', system-ui, sans-serif"
export const FONT_ARABIC = "'IBM Plex Sans Arabic', 'Space Grotesk', system-ui, sans-serif"
export const FONT_MONO = "'Space Mono', Menlo, Consolas, monospace"

export const FONT_LOAD_SPECS: Array<[string, string]> = [
  ["400 14px 'Space Grotesk'", 'Abc'],
  ["500 14px 'Space Grotesk'", 'Abc'],
  ["700 14px 'Space Grotesk'", 'Abc'],
  ["400 14px 'IBM Plex Sans Arabic'", 'مرحبا'],
  ["500 14px 'IBM Plex Sans Arabic'", 'مرحبا'],
  ["700 14px 'IBM Plex Sans Arabic'", 'مرحبا'],
  ["400 12px 'Space Mono'", 'Abc'],
  ["700 12px 'Space Mono'", 'Abc'],
  ["400 15px 'KaTeX_Main'", 'x'],
  ["700 15px 'KaTeX_Main'", 'x'],
  ["italic 400 15px 'KaTeX_Math'", 'x'],
  ["400 15px 'KaTeX_AMS'", '∑'],
  ["400 15px 'KaTeX_Size1'", '∑'],
  ["400 15px 'KaTeX_Size2'", '∑'],
  ["400 15px 'KaTeX_Size3'", '('],
  ["400 15px 'KaTeX_Size4'", '('],
]

export const TEXT = {
  coverTitle: { size: 36, line: 44, weight: 700, spacing: '-0.02em' },
  h1: { size: 22, line: 26, weight: 700, spacing: '-0.01em' },
  h2: { size: 17, line: 21, weight: 700 },
  blockTitle: { size: 14, line: 18, weight: 700 },
  summary: { size: 13, line: 18, weight: 500 },
  detail: { size: 12, line: 17, weight: 500 },
  small: { size: 11.5, line: 15.5, weight: 500 },
  mono: { size: 10, line: 13, weight: 700, spacing: '0.04em', mono: true },
  monoSmall: { size: 9.5, line: 12.5, weight: 700, spacing: '0.04em', mono: true },
  footer: { size: 10, line: 13, weight: 500, mono: true },
} as const

export const BORDER = '2px solid #121C1B'

export const RADIUS = {
  card: 10,
  big: 14,
  tile: 6,
  pill: 999,
} as const

export const SHADOW = {
  cover: `6px 6px 0 ${COLORS.ink}`,
  chapter: `4px 4px 0 ${COLORS.ink}`,
  card: `2px 2px 0 ${COLORS.ink}`,
} as const

export const SHADOW_GUTTER = 4
export const COVER_SHADOW_GUTTER = 6

export const PAD = {
  chapterTop: 14,
  chapterBottom: 10,
  sectionTop: 10,
  sectionBottom: 8,
  blockBottom: 8,
  blockIndent: 0,
  cardRowBottom: 12,
  cardGap: 12,
  rowGap: 4,
} as const

export const COMPACT_PAD = {
  chapterTop: 9,
  chapterBottom: 6,
  sectionTop: 7,
  sectionBottom: 5,
  blockBottom: 5,
  blockIndent: 0,
  cardRowBottom: 8,
  cardGap: 10,
  rowGap: 3,
} as const

export const PX_PER_MM = 96 / 25.4

export function mmToPx(mm: number): number {
  return Math.round((mm * 96) / 25.4)
}

export const PAPER_MM = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
} as const

export function parsePaper(paper: Paper): {
  size: 'a4' | 'letter'
  layout: 'mixed' | 'portrait' | 'landscape'
} {
  const [rawSize, rawLayout] = paper.split('-')
  const size: 'a4' | 'letter' = rawSize === 'letter' ? 'letter' : 'a4'
  const layout: 'mixed' | 'portrait' | 'landscape' =
    rawLayout === 'portrait' || rawLayout === 'landscape' || rawLayout === 'mixed'
      ? rawLayout
      : 'mixed'
  return { size, layout }
}

export function orientationOf(paper: Paper, kind: PageKind): 'portrait' | 'landscape' {
  if (kind === 'map') {
    return 'landscape'
  }
  const { layout } = parsePaper(paper)
  if (layout === 'mixed') {
    return 'portrait'
  }
  return layout
}

export function pageSizeMm(paper: Paper, kind: PageKind): { w: number; h: number } {
  const { size } = parsePaper(paper)
  const ori = orientationOf(paper, kind)
  const base = PAPER_MM[size]
  return ori === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h }
}

export function pageSizePx(paper: Paper, kind: PageKind): { w: number; h: number } {
  const mm = pageSizeMm(paper, kind)
  return {
    w: mmToPx(mm.w),
    h: mmToPx(mm.h),
  }
}

export function bodyBoxPx(
  paper: Paper,
  kind: PageKind,
): { x: number; y: number; w: number; h: number } {
  const page = pageSizePx(paper, kind)
  if (kind === 'cover') {
    const m = mmToPx(20)
    return {
      x: m,
      y: m,
      w: page.w - 2 * m,
      h: page.h - 2 * m,
    }
  }
  if (kind === 'map') {
    const m = mmToPx(12)
    return {
      x: m,
      y: m,
      w: page.w - 2 * m,
      h: page.h - 2 * m,
    }
  }
  const x = mmToPx(14)
  const y = mmToPx(22)
  return {
    x,
    y,
    w: page.w - 2 * x,
    h: page.h - y - mmToPx(22),
  }
}

export function fontFor(dir: 'ltr' | 'rtl', mono?: boolean): string {
  if (mono) {
    return dir === 'rtl' ? FONT_ARABIC : FONT_MONO
  }
  return dir === 'rtl' ? FONT_ARABIC : FONT_LATIN
}

export function textStyle(name: keyof typeof TEXT, dir: 'ltr' | 'rtl'): CSSProperties {
  const t = TEXT[name]
  const isRtl = dir === 'rtl'
  const isMono = 'mono' in t && t.mono
  const fontFamily = fontFor(dir, isMono)
  const fontSize = t.size
  const lineHeight = t.line + (isRtl ? 3 : 0)
  const fontWeight = isRtl && isMono ? 700 : t.weight

  const style: CSSProperties = {
    fontFamily,
    fontSize,
    // A string with px: React treats a bare number as a multiple of the font size.
    lineHeight: `${lineHeight}px`,
    fontWeight,
  }

  if (!isRtl && 'spacing' in t && t.spacing) {
    style.letterSpacing = t.spacing
  }

  if (!isRtl && (name === 'mono' || name === 'monoSmall')) {
    style.textTransform = 'uppercase'
  }

  return style
}
