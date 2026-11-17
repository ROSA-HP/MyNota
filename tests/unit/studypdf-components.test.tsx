import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import {
  ContentPage,
  CoverPage,
  FlowUnitView,
  MapSlot,
  TocPage,
} from '@/features/export/studypdf/components'
import type { BlockUnit, StudyLabels } from '@/features/export/studypdf/types'

const testLabels: StudyLabels = {
  madeWith: 'Made with MyNota',
  contents: 'Contents',
  chapter: 'Chapter',
  chapterShort: (n) => `Ch.${n}`,
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
  sticker: { notes: 'Study notes', summary: 'Summary', cards: 'Cards', maps: 'Map' },
  stats: {
    chapters: 'Chapters',
    sections: 'Sections',
    blocks: 'Blocks',
    formulas: 'Formulas',
    cards: 'Cards',
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

describe('studypdf components', () => {
  it('renders FlowUnitView with an Arabic title and dir rtl with IBM Plex Sans Arabic', () => {
    const block: BlockUnit = {
      kind: 'block',
      id: 'b1',
      relDepth: 0,
      title: 'عنوان تجريبي',
      type: 'concept',
      importance: 'core',
      color: 'sky',
      dir: 'rtl',
      aiAdded: false,
      rows: [],
    }

    const { container } = render(
      <FlowUnitView unit={block} dir="rtl" labels={testLabels} aiTags={false} atTop={false} />,
    )

    const rtlEl = Array.from(container.querySelectorAll<HTMLElement>('[dir="rtl"]')).find(
      (el) => el.style.fontFamily.length > 0,
    )
    expect(rtlEl).toBeDefined()
    expect(rtlEl!.style.fontFamily).toMatch(/^['"]?IBM Plex Sans Arabic/)
  })

  it('shows importance pill for core and extra but not for supporting', () => {
    const makeBlock = (importance: BlockUnit['importance']): BlockUnit => ({
      kind: 'block',
      id: 'b',
      relDepth: 0,
      title: 'Title',
      type: 'concept',
      importance,
      color: 'yellow',
      dir: 'ltr',
      aiAdded: false,
      rows: [],
    })

    const { container: cCore } = render(
      <FlowUnitView
        unit={makeBlock('core')}
        dir="ltr"
        labels={testLabels}
        aiTags={false}
        atTop={false}
      />,
    )
    expect(cCore.textContent).toContain('Core')

    const { container: cExtra } = render(
      <FlowUnitView
        unit={makeBlock('extra')}
        dir="ltr"
        labels={testLabels}
        aiTags={false}
        atTop={false}
      />,
    )
    expect(cExtra.textContent).toContain('Extra')

    const { container: cSupporting } = render(
      <FlowUnitView
        unit={makeBlock('supporting')}
        dir="ltr"
        labels={testLabels}
        aiTags={false}
        atTop={false}
      />,
    )
    expect(cSupporting.textContent).not.toContain('Core')
    expect(cSupporting.textContent).not.toContain('Extra')
  })

  it('shows AI pill only when aiTags is true', () => {
    const block: BlockUnit = {
      kind: 'block',
      id: 'b',
      relDepth: 0,
      title: 'Title',
      type: 'concept',
      importance: 'supporting',
      color: 'yellow',
      dir: 'ltr',
      aiAdded: true,
      rows: [],
    }

    const { container: withoutTags } = render(
      <FlowUnitView unit={block} dir="ltr" labels={testLabels} aiTags={false} atTop={false} />,
    )
    expect(withoutTags.textContent).not.toContain('AI Added')

    const { container: withTags } = render(
      <FlowUnitView unit={block} dir="ltr" labels={testLabels} aiTags={true} atTop={false} />,
    )
    expect(withTags.textContent).toContain('AI Added')
  })

  it('renders only the slice of rows specified by rowFrom and rowTo', () => {
    const block: BlockUnit = {
      kind: 'block',
      id: 'b',
      relDepth: 0,
      title: 'Title',
      type: 'concept',
      importance: 'supporting',
      color: 'yellow',
      dir: 'ltr',
      aiAdded: false,
      rows: [
        { kind: 'summary', text: 'Row 0' },
        { kind: 'detail', detail: { kind: 'text', text: 'Row 1' } },
        { kind: 'detail', detail: { kind: 'text', text: 'Row 2' } },
        { kind: 'detail', detail: { kind: 'text', text: 'Row 3' } },
      ],
    }

    const { container } = render(
      <FlowUnitView
        unit={block}
        dir="ltr"
        labels={testLabels}
        aiTags={false}
        atTop={false}
        rowFrom={1}
        rowTo={3}
      />,
    )

    const renderedRows = Array.from(container.querySelectorAll('[data-row]')).map((el) =>
      el.getAttribute('data-row'),
    )
    expect(renderedRows).toEqual(['1', '2'])
  })

  it('shows continued label and hides type name when continued is true', () => {
    const block: BlockUnit = {
      kind: 'block',
      id: 'b',
      relDepth: 0,
      title: 'Title',
      type: 'concept',
      importance: 'core',
      color: 'yellow',
      dir: 'ltr',
      aiAdded: false,
      rows: [{ kind: 'summary', text: 'Row text' }],
    }

    const { container } = render(
      <FlowUnitView
        unit={block}
        dir="ltr"
        labels={testLabels}
        aiTags={false}
        atTop={false}
        continued={true}
      />,
    )

    expect(container.textContent).toContain('Continued')
    expect(container.textContent).not.toContain('Concept')
  })

  it('renders formula row with katex element', () => {
    const block: BlockUnit = {
      kind: 'block',
      id: 'b',
      relDepth: 0,
      title: 'Formula Block',
      type: 'formula',
      importance: 'core',
      color: 'mint',
      dir: 'ltr',
      aiAdded: false,
      rows: [{ kind: 'detail', detail: { kind: 'formula', latex: 'E=mc^2' } }],
    }

    const { container } = render(
      <FlowUnitView unit={block} dir="ltr" labels={testLabels} aiTags={false} atTop={false} />,
    )

    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('shows arrow ← for outgoing link in rtl block and → in ltr block', () => {
    const rtlBlock: BlockUnit = {
      kind: 'block',
      id: 'b_rtl',
      relDepth: 0,
      title: 'Title',
      type: null,
      importance: 'supporting',
      color: 'yellow',
      dir: 'rtl',
      aiAdded: false,
      rows: [{ kind: 'link', label: 'سبب', other: 'نتيجة', outgoing: true }],
    }

    const { container: cRtl } = render(
      <FlowUnitView unit={rtlBlock} dir="rtl" labels={testLabels} aiTags={false} atTop={false} />,
    )
    expect(cRtl.textContent).toContain('←')

    const ltrBlock: BlockUnit = {
      kind: 'block',
      id: 'b_ltr',
      relDepth: 0,
      title: 'Title',
      type: null,
      importance: 'supporting',
      color: 'yellow',
      dir: 'ltr',
      aiAdded: false,
      rows: [{ kind: 'link', label: 'causes', other: 'effect', outgoing: true }],
    }

    const { container: cLtr } = render(
      <FlowUnitView unit={ltrBlock} dir="ltr" labels={testLabels} aiTags={false} atTop={false} />,
    )
    expect(cLtr.textContent).toContain('→')
  })

  it('shows 3 / 12 in ContentPage footer', () => {
    const { container } = render(
      <ContentPage
        size={{ w: 794, h: 1123 }}
        body={{ x: 53, y: 83, w: 688, h: 957 }}
        tone="mint"
        dir="ltr"
        headerTitle="Test Header"
        headerChapter={null}
        headerTag={null}
        pageNo={3}
        total={12}
      >
        <div>Content</div>
      </ContentPage>,
    )

    expect(container.textContent).toContain('3 / 12')
  })

  it('carries data-toc-page on TocPage rows', () => {
    const { container } = render(
      <TocPage
        size={{ w: 794, h: 1123 }}
        body={{ x: 53, y: 83, w: 688, h: 957 }}
        tone="mint"
        dir="ltr"
        headerTitle="My Book"
        pageNo={2}
        total={10}
        contentsLabel="Contents"
        rows={[
          {
            level: 'chapter',
            label: '1',
            title: 'First Chapter',
            color: 'sky',
            page: 3,
            dir: 'ltr',
          },
          {
            level: 'section',
            label: '1.1',
            title: 'First Section',
            color: 'sky',
            page: 4,
            dir: 'ltr',
          },
        ]}
      />,
    )

    const rowEls = container.querySelectorAll('[data-toc-page]')
    expect(rowEls).toHaveLength(2)
    expect(rowEls[0]?.getAttribute('data-toc-page')).toBe('3')
    expect(rowEls[1]?.getAttribute('data-toc-page')).toBe('4')
  })

  it('renders no tabs when CoverPage has 1 tab and renders both when it has 2 tabs', () => {
    const { container: cOne } = render(
      <CoverPage
        size={{ w: 794, h: 1123 }}
        tone="mint"
        dir="ltr"
        title="Cover"
        kindLabel="Book"
        stickerLabel="Study notes"
        stats={[{ n: 5, label: 'Blocks' }]}
        tabs={[{ number: 1, title: 'Chapter 1', color: 'yellow' }]}
        moreLabel={null}
        madeWith="Made with MyNota"
      />,
    )
    expect(cOne.textContent).not.toContain('Chapter 1')

    const { container: cTwo } = render(
      <CoverPage
        size={{ w: 794, h: 1123 }}
        tone="mint"
        dir="ltr"
        title="Cover"
        kindLabel="Book"
        stickerLabel="Study notes"
        stats={[{ n: 5, label: 'Blocks' }]}
        tabs={[
          { number: 1, title: 'Chapter 1', color: 'yellow' },
          { number: 2, title: 'Chapter 2', color: 'coral' },
        ]}
        moreLabel={null}
        madeWith="Made with MyNota"
      />,
    )
    expect(cTwo.textContent).toContain('Chapter 1')
    expect(cTwo.textContent).toContain('Chapter 2')
  })

  it('renders CoverPage chapter and section outline even for a single-chapter map', () => {
    const { container } = render(
      <CoverPage
        size={{ w: 794, h: 1123 }}
        tone="mint"
        dir="ltr"
        title="Polarization"
        kindLabel="Notes"
        stickerLabel="Study notes"
        stats={[
          { n: 1, label: 'Chapters' },
          { n: 3, label: 'Sections' },
        ]}
        tabs={[{ number: 1, title: 'Wave Optics', color: 'yellow' }]}
        outline={[
          {
            number: 1,
            title: 'Wave Optics',
            color: 'yellow',
            dir: 'ltr',
            sections: [
              { label: '1.1', title: 'Electromagnetic Waves', dir: 'ltr' },
              { label: '1.2', title: 'Energy Transport', dir: 'ltr' },
            ],
          },
        ]}
        outlineLabel="Contents"
        moreLabel={null}
        madeWith="Made with MyNota"
      />,
    )

    expect(container.textContent).toContain('Wave Optics')
    expect(container.textContent).toContain('Electromagnetic Waves')
    expect(container.textContent).toContain('Energy Transport')
  })

  it('shows accurate +N more badge on CoverPage when chapters or sections overflow', () => {
    const manyChapters = Array.from({ length: 8 }, (_, idx) => ({
      number: idx + 1,
      title: `Chapter ${idx + 1}`,
      color: 'yellow' as const,
      dir: 'ltr' as const,
      sections: [{ label: `${idx + 1}.1`, title: `Sec ${idx + 1}`, dir: 'ltr' as const }],
    }))
    const { container: landscapeOverflow } = render(
      <CoverPage
        size={{ w: 1123, h: 794 }}
        tone="mint"
        dir="ltr"
        title="Landscape Compendium"
        kindLabel="Book"
        stickerLabel="Study notes"
        stats={[{ n: 8, label: 'Chapters' }]}
        tabs={[]}
        outline={manyChapters}
        outlineLabel="Contents"
        moreLabel={null}
        formatMore={(n) => `+${n} more`}
        madeWith="Made with MyNota"
      />,
    )
    expect(landscapeOverflow.querySelector('[data-outline-more]')?.textContent).toBe('+4 more')
    expect(landscapeOverflow.textContent).not.toContain('Chapter 5')
  })

  it('aligns nested blocks flush with zero start indent and justifies prose with inline KaTeX', () => {
    const nestedBlock: BlockUnit = {
      kind: 'block',
      id: 'b_nested',
      relDepth: 2,
      title: 'Poynting Vector',
      type: 'formula',
      importance: 'core',
      color: 'coral',
      dir: 'ltr',
      aiAdded: false,
      rows: [
        { kind: 'summary', text: 'Quantifies energy transport with \\vec{S}.' },
        {
          kind: 'detail',
          detail: {
            kind: 'formula',
            latex: '\\vec{S} = \\frac{1}{\\mu_0} \\vec{E} \\times \\vec{B}',
            variables: '\\vec{S} = Poynting vector; \\mu_0 = permeability constant',
          },
        },
        {
          kind: 'detail',
          detail: {
            kind: 'question',
            front: 'What is \\vec{E} \\times \\vec{B}?',
            back: 'Propagation direction using \\omega = \\frac{1}{\\sqrt{LC}}',
          },
        },
      ],
    }

    const { container } = render(
      <FlowUnitView unit={nestedBlock} dir="ltr" labels={testLabels} aiTags={false} atTop />,
    )

    const outer = container.firstElementChild as HTMLElement
    expect(outer.style.paddingInlineStart).toBe('0px')

    const rows = container.querySelectorAll('[data-row]')
    expect((rows[0]?.firstElementChild as HTMLElement).style.textAlign).toBe('justify')
    // Display formula + inline \vec{S}, \vec{S}, \mu_0, \vec{E} \times \vec{B}, \omega = \frac{1}{\sqrt{LC}}
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(5)
    expect(container.textContent).not.toContain('\\mu_0')
  })

  it('renders flush symmetric gutters, justified link rows, legend variables, and compact cover summaries', () => {
    const { container: pageContainer } = render(
      <ContentPage
        size={{ w: 794, h: 1123 }}
        body={{ x: 53, y: 83, w: 688, h: 957 }}
        tone="mint"
        dir="ltr"
        headerTitle="Electromagnetic Waves"
        headerChapter={{ label: 'Ch. 1', title: 'Waves', color: 'coral' }}
        headerTag={null}
        pageNo={2}
        total={5}
      >
        <FlowUnitView
          unit={{
            kind: 'block',
            id: 'b_wave',
            relDepth: 0,
            title: 'Wave Intensity',
            type: 'formula',
            importance: 'core',
            color: 'coral',
            dir: 'ltr',
            aiAdded: false,
            rows: [
              {
                kind: 'detail',
                detail: {
                  kind: 'formula',
                  latex: 'I = \\frac{1}{c\\mu_0} E_{\\mathrm{rms}}^2',
                  variables: 'I = wave intensity; c = speed of light; \\mu_0 = permeability constant',
                },
              },
              {
                kind: 'link',
                label: 'determines absorption pressure',
                other: 'Total Absorption',
                outgoing: true,
              },
            ],
          }}
          dir="ltr"
          labels={testLabels}
          aiTags={false}
          atTop
        />
      </ContentPage>,
    )

    const outer = pageContainer.firstElementChild as HTMLElement
    // Header wrapper, Body slot, Footer wrapper share exact 4px SHADOW_GUTTER right inset in LTR.
    const bands = Array.from(outer.children) as HTMLElement[]
    expect(bands[0]?.style.paddingRight).toBe('4px')
    expect(bands[2]?.style.paddingRight).toBe('4px')
    const flowOuter = bands[1]?.querySelector('[data-unit-id="b_wave"]') as HTMLElement
    expect(flowOuter.style.paddingRight).toBe('4px')

    // All three legend variables (I, c, \mu_0) plus the display formula render via KaTeX.
    expect(flowOuter.querySelectorAll('.katex').length).toBe(4)

    // Link row text spans justify cleanly without ragged text.
    const linkRow = flowOuter.querySelector('[data-row="1"]')?.firstElementChild as HTMLElement
    expect(linkRow.style.textAlign).toBe('justify')

    // Compact CoverPage renders summaries when portrait outline has <= 3 chapters / <= 8 sections.
    const { container: coverContainer } = render(
      <CoverPage
        size={{ w: 794, h: 1123 }}
        tone="mint"
        dir="ltr"
        title="Electromagnetic Waves & Polarization"
        kindLabel="Notes"
        stickerLabel="Study notes"
        stats={[
          { n: 1, label: 'Chapters' },
          { n: 2, label: 'Sections' },
        ]}
        tabs={[]}
        outline={[
          {
            number: 1,
            title: 'EM Waves & Polarization',
            summary: 'Maxwell equations, energy transport, radiation pressure, and polarization.',
            color: 'coral',
            dir: 'ltr',
            sections: [
              {
                label: '1.1',
                title: 'Wave Propagation & Energy',
                summary: 'Poynting vector, intensity, and inverse-square law.',
                dir: 'ltr',
              },
              {
                label: '1.2',
                title: 'Polarization Laws',
                summary: 'Malus law and Brewster angle.',
                dir: 'ltr',
              },
            ],
          },
        ]}
        outlineLabel="Contents"
        moreLabel={null}
        madeWith="Made with MyNota"
      />,
    )
    expect(coverContainer.textContent).toContain('Poynting vector, intensity, and inverse-square law.')
    expect(coverContainer.textContent).toContain('Malus law and Brewster angle.')
  })

  it('contains exactly one data-slot element in MapSlot and it has no children', () => {
    const { container } = render(
      <MapSlot size={{ x: 53, y: 83, w: 1017, h: 628 }} caption="Whole Map" />,
    )
    const slotEls = container.querySelectorAll('[data-slot="picture"]')
    expect(slotEls).toHaveLength(1)
    expect(slotEls[0]?.children).toHaveLength(0)
  })

  it('contains no dangerouslySetInnerHTML in source files', () => {
    const componentsCode = readFileSync(
      resolve(process.cwd(), 'src/features/export/studypdf/components.tsx'),
      'utf8',
    )
    expect(componentsCode).not.toContain('dangerouslySetInnerHTML')
    expect(componentsCode).not.toContain('innerHTML')
  })
})
