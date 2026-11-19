import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MathErrorProvider, MathFormula, RichMathText } from '@/components/ui/MathFormula'
import { parseFormulaLegend, resolveFormulaLegend } from '@/lib/formulaLegend'
import type { OutlineItem } from '@/features/export/outline'
import {
  cleanAndAnalyzeOutline,
  proseTypographyStyle,
  stripAiPreamble,
} from '@/features/export/studypdf/cleanup'
import { CoverPage, FlowUnitView } from '@/features/export/studypdf/components'
import { buildStudyDoc } from '@/features/export/studypdf/model'
import { paginateFlow } from '@/features/export/studypdf/paginate'
import { prepareStudyPdf } from '@/features/export/studypdf'
import type { BlockUnit, MeasuredUnit, StudyLabels } from '@/features/export/studypdf/types'

const testLabels: StudyLabels = {
  madeWith: 'Exported from MyNota on 18 Nov 2026',
  contents: 'Contents',
  whatsInside: "What's inside",
  chapter: 'Chapter',
  chapterShort: (n) => `Ch. ${n}`,
  continued: 'Continued',
  addedByAi: 'AI Added',
  flashcards: 'Flashcards',
  answers: 'Answers',
  q: 'Q',
  a: 'A',
  page: (n) => `p. ${n}`,
  more: (count) => `+${count} more`,
  importance: { core: 'Core', extra: 'Extra' },
  kind: { book: 'Book', notes: 'Notes', blank: 'Canvas' },
  sticker: { notes: 'Study Notes', summary: 'Summary', cards: 'Flashcards', maps: 'Mind Maps' },
  stats: { chapters: 'Chapters', sections: 'Sections', blocks: 'Blocks', formulas: 'Formulas', cards: 'Cards' },
  statLabel: (key, count) => {
    const map = {
      chapters: ['Chapter', 'Chapters'],
      sections: ['Section', 'Sections'],
      blocks: ['Block', 'Blocks'],
      formulas: ['Formula', 'Formulas'],
      cards: ['Card', 'Cards'],
    } as const
    return count === 1 ? map[key][0] : map[key][1]
  },
  types: {
    definition: 'Definition',
    concept: 'Concept',
    process_step: 'Step',
    event: 'Event',
    person: 'Person',
    formula: 'Formula',
    example: 'Example',
    comparison: 'Comparison',
    key_fact: 'Key Fact',
    warning: 'Warning',
    vocabulary: 'Vocabulary',
  },
  empty: 'Empty',
}

function makeOutlineItem(
  id: string,
  depth: number,
  level: OutlineItem['level'],
  extra: Partial<OutlineItem> = {},
): OutlineItem {
  return {
    id,
    depth,
    level,
    title: id,
    summary: '',
    details: [],
    links: [],
    cards: [],
    type: null,
    importance: 'supporting',
    color: 'sky',
    dir: 'ltr',
    aiAdded: false,
    page: null,
    detailBlocks: [],
    ...extra,
  }
}

describe('PDF Overhaul: Problem 1-6 Comprehensive Verification', () => {
  it('renders ALL problematic LaTeX strings cleanly without raw backslash leaks', () => {
    const cases = [
      'Speed in vacuum is approximately 3.0 \\times 10^{8} m/s.',
      'Measured in units of watts per square meter (\\text{W/m}^2).',
      '\\vec{S} = \\frac{1}{\\mu_0} \\vec{E} \\times \\vec{B}, with units of W/m^2.',
      '\\frac{\\partial E}{\\partial x} = -\\frac{\\partial B}{\\partial t}',
      '\\theta_{B} + \\theta_{r} = 90^{\\circ} (they are perpendicular to each other).',
      "What formula defines Brewster's angle \\theta_{B}?",
      'p_r = I / c',
    ]

    for (const sample of cases) {
      const { container } = render(<RichMathText text={sample} />)
      expect(container.querySelectorAll('.katex').length, sample).toBeGreaterThanOrEqual(1)
      expect(container.textContent, sample).not.toContain('\\vec')
      expect(container.textContent, sample).not.toContain('\\mu_0')
      expect(container.textContent, sample).not.toContain('\\times')
      expect(container.textContent, sample).not.toContain('\\frac')
      expect(container.textContent, sample).not.toContain('\\theta')
      expect(container.textContent, sample).not.toContain('\\circ')
      expect(container.querySelector('[data-katex-error]')).toBeNull()
    }
  })

  it('parses legends including semicolons inside \\text{} and bare subscripts like E_m and B_m', () => {
    const semicolonsInText = parseFormulaLegend(
      '\\omega = \\text{angular frequency; } L = \\text{inductance; } C = \\text{capacitance}',
    )
    expect(semicolonsInText).toEqual([
      { symbol: '\\omega', meaning: 'angular frequency' },
      { symbol: 'L', meaning: 'inductance' },
      { symbol: 'C', meaning: 'capacitance' },
    ])

    const bareSubs = resolveFormulaLegend({
      kind: 'formula',
      latex: 'E_m = c B_m',
      variables: 'E_m = electric field amplitude; B_m = magnetic field amplitude',
    })
    expect(bareSubs.entries).toEqual([
      { symbol: 'E_m', meaning: 'electric field amplitude' },
      { symbol: 'B_m', meaning: 'magnetic field amplitude' },
    ])

    const { container } = render(
      <RichMathText
        text="\\vec{S} = Poynting vector; \\mu_0 = permeability constant; \\vec{E} = electric field; \\vec{B} = magnetic field"
        legend
      />,
    )
    expect(container.querySelectorAll('.katex').length).toBe(4)
    expect(container.textContent).not.toContain('\\vec')
    expect(container.textContent).not.toContain('\\mu_0')
  })

  it('highlights malformed LaTeX visibly and reports via MathErrorProvider without silent failure', () => {
    const onErr = vi.fn()
    const { container } = render(
      <MathErrorProvider onError={onErr}>
        <MathFormula latex={'\\frac{1}{'} display={false} />
      </MathErrorProvider>,
    )
    const errEl = container.querySelector('[data-katex-error="true"]')
    expect(errEl).not.toBeNull()
    expect(errEl?.textContent).toBe('\\frac{1}{')
    expect(onErr).toHaveBeenCalledTimes(1)
  })

  it('strips AI preambles, warns on suspicious u_E vs B^2/(2\\mu_0) science, and warns on typos without silent alteration', () => {
    const stripped = stripAiPreamble(
      'Here is a comprehensive breakdown of electromagnetic waves: Energy flows perpendicularly.',
    )
    expect(stripped.cleaned).toBe('Energy flows perpendicularly.')
    expect(stripped.removed).toContain('Here is')

    const items: OutlineItem[] = [
      makeOutlineItem('ch1', 0, 'chapter', { title: 'EM Waves' }),
      makeOutlineItem('b1', 1, 'block', {
        title: 'Field Energy Densities',
        summary: 'Here is an overview of field energy. Energy density depends on field squared.',
        detailBlocks: [
          { kind: 'text', text: 'The electric held oscillates perpendicular to propagation.' },
          { kind: 'formula', latex: 'u_E = B^2 / (2\\mu_0)' },
        ],
      }),
    ]

    const { cleanedItems, warnings } = cleanAndAnalyzeOutline(items)
    // AI preamble removed & warned
    expect(cleanedItems[1]?.summary).toBe('Energy density depends on field squared.')
    expect(cleanedItems[1]?.summary).not.toMatch(/^Here is/i)
    // Typo and science warnings flagged WITHOUT silently altering source words/equations
    expect(cleanedItems[1]?.detailBlocks[0]).toEqual({
      kind: 'text',
      text: 'The electric held oscillates perpendicular to propagation.',
    })
    expect(cleanedItems[1]?.detailBlocks[1]).toEqual({
      kind: 'formula',
      latex: 'u_E = B^2 / (2\\mu_0)',
    })
    expect(warnings.some((w) => w.kind === 'preamble')).toBe(true)
    expect(warnings.some((w) => w.kind === 'science')).toBe(true)
    expect(warnings.some((w) => w.kind === 'typo')).toBe(true)
  })

  it('enforces multilingual justification, EN/DE hyphenation, and zero Arabic hyphenation or letter-spacing', () => {
    const enTypo = proseTypographyStyle('Electromagnetic waves travel through vacuum.', 'en')
    expect(enTypo.lang).toBe('en')
    expect(enTypo.dir).toBe('auto')
    expect(enTypo.style.textAlign).toBe('justify')
    expect(enTypo.style.textAlignLast).toBe('start')
    expect(enTypo.style.hyphens).toBe('auto')
    expect(enTypo.style.widows).toBe(2)

    const deTypo = proseTypographyStyle('Elektromagnetische Wellen und Felder.', 'de')
    expect(deTypo.lang).toBe('de')
    expect(deTypo.style.hyphens).toBe('auto')

    const arTypo = proseTypographyStyle('تنتقل الموجات الكهرومغناطيسية في الفراغ.', 'ar')
    expect(arTypo.lang).toBe('ar')
    expect(arTypo.style.textAlign).toBe('justify')
    expect(arTypo.style.hyphens).toBe('none')
    expect(arTypo.style.letterSpacing).toBe('normal')
  })

  it('collapses single redundant chapter matching document title and skips sparse Page 2 TOC when <= 8 sections', async () => {
    const items: OutlineItem[] = [
      makeOutlineItem('ch', 0, 'chapter', { title: 'Electromagnetic Waves' }),
      makeOutlineItem('s1', 1, 'section', { title: 'Wave Propagation' }),
      makeOutlineItem('b1', 2, 'block', {
        title: 'Poynting Vector',
        detailBlocks: [{ kind: 'formula', latex: '\\vec{S} = \\frac{1}{\\mu_0}\\vec{E}\\times\\vec{B}' }],
      }),
      makeOutlineItem('s2', 1, 'section', { title: 'Polarization' }),
      makeOutlineItem('b2', 2, 'block', {
        title: "Brewster's Law",
        detailBlocks: [{ kind: 'text', text: '\\theta_{B} + \\theta_{r} = 90^{\\circ}' }],
      }),
    ]

    const doc = buildStudyDoc({
      title: 'Electromagnetic Waves',
      kind: 'notes',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: true, cards: false, sources: true, aiTags: true },
    })
    expect(doc.singleChapterCollapsed).toBe(true)
    expect(doc.flow.filter((u) => u.kind === 'chapter')).toHaveLength(0)

    const prep = await prepareStudyPdf({
      title: 'Electromagnetic Waves',
      kind: 'notes',
      dateLabel: '18 Nov 2026',
      preset: 'notes',
      paper: 'a4-mixed',
      tone: 'mint',
      dir: 'ltr',
      lang: 'en',
      items,
      pictures: [],
      include: { links: true, cards: false, sources: true, aiTags: true },
      answersAtEnd: false,
      labels: testLabels,
    })

    // Sparse page-2 TOC is skipped because Cover "What's inside" already lists all 2 sections
    expect(prep.tocPageEntries).toHaveLength(0)
    // Cover sections receive exact 1-based target page numbers
    const firstSec = prep.coverOutlineWithPages[0]?.sections[0]
    expect(firstSec?.page).toBe(2)
  })

  it('renders nested blocks flush left/right with colored left rail and parent breadcrumb', () => {
    const nested: BlockUnit = {
      kind: 'block',
      id: 'nested-1',
      relDepth: 1,
      parentTitle: 'Maxwell Equations',
      title: 'Differential Form',
      type: 'concept',
      importance: 'core',
      color: 'coral',
      dir: 'ltr',
      aiAdded: false,
      rows: [{ kind: 'summary', text: '\\frac{\\partial E}{\\partial x} = -\\frac{\\partial B}{\\partial t}' }],
    }
    const { container } = render(
      <FlowUnitView unit={nested} dir="ltr" labels={testLabels} aiTags={false} atTop />,
    )
    const outer = container.firstElementChild as HTMLElement
    expect(outer.style.paddingInlineStart).toBe('0px')
    expect(container.querySelector('[data-left-rail]')).not.toBeNull()
    expect(container.textContent).toContain('Maxwell Equations')
  })

  it('renders CoverPage cleanly across long English, German, and Arabic titles with singular/plural stats', () => {
    const longTitles = [
      { title: 'Electromagnetic Radiation Pressure, Poynting Flux, and Polarization Laws in Optics', lang: 'en' as const, dir: 'ltr' as const },
      { title: 'Elektromagnetische Wellenausbreitung, Energietransport und Polarisationsgesetze', lang: 'de' as const, dir: 'ltr' as const },
      { title: 'الموجات الكهرومغناطيسية ونقل الطاقة وضغط الإشعاع وقوانين الاستقطاب الضوئي', lang: 'ar' as const, dir: 'rtl' as const },
    ]
    for (const tc of longTitles) {
      const { container } = render(
        <CoverPage
          size={{ w: 794, h: 1123 }}
          tone="mint"
          dir={tc.dir}
          docLang={tc.lang}
          title={tc.title}
          kindLabel="Notes"
          stickerLabel="Study Notes"
          stats={[
            { key: 'chapters', n: 1, label: 'Chapters' },
            { key: 'sections', n: 7, label: 'Sections' },
          ]}
          statLabel={testLabels.statLabel}
          tabs={[]}
          outline={[
            {
              number: null,
              title: '',
              color: 'sky',
              dir: tc.dir,
              sections: Array.from({ length: 10 }, (_, idx) => ({
                label: `${idx + 1}`,
                title: `Section ${idx + 1}`,
                dir: tc.dir,
                page: idx + 2,
              })),
            },
          ]}
          outlineLabel="What's inside"
          moreLabel={null}
          formatMore={(c) => `+${c} more`}
          madeWith="Exported from MyNota on 18 Nov 2026"
        />,
      )
      expect(container.textContent).toContain('1')
      expect(container.textContent).toContain('Chapter')
      expect(container.textContent).not.toContain('1Chapters')
      expect(container.textContent).toContain('7')
      expect(container.textContent).toContain('Sections')
      // Max 8 sections rendered + "+2 more"
      expect(container.querySelector('[data-outline-more]')?.textContent).toBe('+2 more')
      expect(container.textContent).not.toContain('Section 9')
      expect(container.textContent).toContain('18 Nov 2026')
    }
  })

  it('handles 50+ page / 200+ node benchmark cleanly within budget', () => {
    const items: OutlineItem[] = [makeOutlineItem('book', 0, 'book', { title: 'Large Physics Compendium' })]
    for (let ch = 1; ch <= 10; ch++) {
      items.push(makeOutlineItem(`ch-${ch}`, 1, 'chapter', { title: `Chapter ${ch}` }))
      for (let sec = 1; sec <= 4; sec++) {
        items.push(makeOutlineItem(`sec-${ch}-${sec}`, 2, 'section', { title: `Section ${ch}.${sec}` }))
        for (let b = 1; b <= 5; b++) {
          items.push(
            makeOutlineItem(`b-${ch}-${sec}-${b}`, 3, 'block', {
              title: `Concept ${ch}.${sec}.${b}`,
              summary: 'Summary of physics principle with \\vec{E} and \\vec{B}.',
              detailBlocks: [
                { kind: 'text', text: 'Detailed explanation of field equations and waves.' },
                { kind: 'formula', latex: 'E_m = c B_m', variables: 'E_m = amplitude; B_m = magnetic amplitude' },
                { kind: 'bullet', text: 'Key bullet point #1 with 3.0 \\times 10^{8} m/s.' },
              ],
            }),
          )
        }
      }
    }

    const start = performance.now()
    const doc = buildStudyDoc({
      title: 'Large Physics Compendium',
      kind: 'book',
      preset: 'notes',
      dir: 'ltr',
      items,
      include: { links: true, cards: false, sources: true, aiTags: true },
    })
    // 10 chapters + 40 sections + 200 blocks = 250 flow units (>200 nodes)
    expect(doc.flow.length).toBe(250)

    const measured: MeasuredUnit[] = doc.flow.map((u) => {
      if (u.kind === 'chapter') return { height: 110, padTop: 14, keepWithNext: 2, split: null }
      if (u.kind === 'section') return { height: 64, padTop: 10, keepWithNext: 1, split: null }
      return {
        height: 220,
        padTop: 0,
        keepWithNext: 0,
        split: { head: 36, rows: [36, 48, 80, 32], base: 20, gap: 4 },
      }
    })
    const pages = paginateFlow(measured, 957, doc.flow)
    const elapsed = performance.now() - start

    expect(pages.length).toBeGreaterThanOrEqual(50)
    expect(elapsed).toBeLessThan(1000)
  })
})
