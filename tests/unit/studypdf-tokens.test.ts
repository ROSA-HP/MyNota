import { describe, expect, it } from 'vitest'
import type { ChapterColor } from '@/lib/database.types'
import {
  CHAPTER_FILL,
  bodyBoxPx,
  mmToPx,
  pageSizePx,
  textStyle,
} from '@/features/export/studypdf/tokens'
import type { PageKind } from '@/features/export/studypdf/types'

describe('studypdf tokens', () => {
  it('converts mm to px correctly', () => {
    expect(mmToPx(14)).toBe(53)
    expect(mmToPx(22)).toBe(83)
  })

  it('matches every row of the table in 5.2 for page size and body box using kind notes', () => {
    // A4 portrait
    expect(pageSizePx('a4-portrait', 'notes')).toEqual({ w: 794, h: 1123 })
    expect(bodyBoxPx('a4-portrait', 'notes')).toEqual({ x: 53, y: 83, w: 688, h: 957 })

    // Letter portrait
    expect(pageSizePx('letter-portrait', 'notes')).toEqual({ w: 816, h: 1056 })
    expect(bodyBoxPx('letter-portrait', 'notes')).toEqual({ x: 53, y: 83, w: 710, h: 890 })

    // A4 landscape
    expect(pageSizePx('a4-landscape', 'notes')).toEqual({ w: 1123, h: 794 })
    expect(bodyBoxPx('a4-landscape', 'notes')).toEqual({ x: 53, y: 83, w: 1017, h: 628 })

    // Letter landscape
    expect(pageSizePx('letter-landscape', 'notes')).toEqual({ w: 1056, h: 816 })
    expect(bodyBoxPx('letter-landscape', 'notes')).toEqual({ x: 53, y: 83, w: 950, h: 650 })
  })

  it('handles a4-mixed and letter-mixed page orientation correctly', () => {
    expect(pageSizePx('a4-mixed', 'map')).toEqual({ w: 1123, h: 794 })

    const portraitKinds: PageKind[] = ['cover', 'toc', 'notes', 'cards', 'answers']
    for (const kind of portraitKinds) {
      expect(pageSizePx('a4-mixed', kind)).toEqual({ w: 794, h: 1123 })
    }

    expect(pageSizePx('letter-mixed', 'map')).toEqual({ w: 1056, h: 816 })
  })

  it('computes text styles properly for direction and mono variants', () => {
    const detailRtl = textStyle('detail', 'rtl')
    // px, not a bare number (React reads a bare number as a multiple of the font size)
    expect(detailRtl.lineHeight).toBe('20px')
    expect(detailRtl.textTransform).toBeUndefined()

    const monoSmallLtr = textStyle('monoSmall', 'ltr')
    expect(monoSmallLtr.textTransform).toBe('uppercase')
  })

  it('always uses landscape orientation and 12mm margins for map pages, and 20mm margins for cover pages', () => {
    expect(pageSizePx('a4-portrait', 'map')).toEqual({ w: 1123, h: 794 })
    expect(pageSizePx('letter-portrait', 'map')).toEqual({ w: 1056, h: 816 })
    expect(bodyBoxPx('a4-portrait', 'map')).toEqual({ x: 45, y: 45, w: 1033, h: 704 })
    expect(bodyBoxPx('a4-portrait', 'cover')).toEqual({ x: 76, y: 76, w: 642, h: 971 })
  })

  it('includes KaTeX_AMS, KaTeX_Size3, and KaTeX_Size4 in FONT_LOAD_SPECS', async () => {
    const { FONT_LOAD_SPECS } = await import('@/features/export/studypdf/tokens')
    const joined = FONT_LOAD_SPECS.join(' ')
    expect(joined).toContain('KaTeX_AMS')
    expect(joined).toContain('KaTeX_Size3')
    expect(joined).toContain('KaTeX_Size4')
  })

  it('has valid hex fills for all ChapterColor keys', () => {
    const colors: ChapterColor[] = [
      'yellow',
      'coral',
      'sky',
      'mint',
      'lavender',
      'pink',
      'orange',
      'lime',
    ]
    for (const c of colors) {
      expect(CHAPTER_FILL[c]).toBeDefined()
      expect(CHAPTER_FILL[c].startsWith('#')).toBe(true)
    }
  })
})
