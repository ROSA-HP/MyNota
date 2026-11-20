import { jsPDF } from 'jspdf'
import React from 'react'
import type { MathErrorReport } from '@/components/ui/MathFormula'
import type { VectorMapPageData } from '../mindmapSvg'
import {
  CardRowView,
  ContentPage,
  CoverPage,
  FlowUnitView,
  TocPage,
  VectorMapPage,
} from './components'
import { cleanAndAnalyzeOutline, type ExportWarning } from './cleanup'
import { ensureFontsLoaded, measureCardRows, measureFlow, paginateCardRows } from './measure'
import { buildStudyDoc } from './model'
import { chapterForPage, pageIndexOfUnits, paginateFlow, paginateToc } from './paginate'
import { capturePageElement } from './render'
import {
  bodyBoxPx,
  COLORS,
  orientationOf,
  pageSizeMm,
  pageSizePx,
  PAD,
  SHADOW_GUTTER,
} from './tokens'
import type {
  CardTile,
  CoverOutlineChapter,
  NotesPage,
  StatKey,
  StudyDoc,
  StudyPdfInput,
} from './types'

export * from './tokens'
export * from './types'
export * from './model'
export * from './paginate'
export * from './components'
export * from './measure'
export * from './render'
export * from './cleanup'

export interface PreparedStudyPdf {
  doc: StudyDoc
  docLang: 'en' | 'de' | 'ar'
  warnings: ExportWarning[]
  recordMathError: (err: MathErrorReport) => void
  compactNotes: boolean
  notesPages: NotesPage[]
  unitPageIndex: number[]
  tocPageEntries: number[][]
  tocRows: Array<{
    level: 'chapter' | 'section'
    label: string
    title: string
    color: StudyDoc['flow'][number]['color']
    page: number
    dir: 'ltr' | 'rtl'
  }>
  vectorMaps: VectorMapPageData[]
  pairedTiles: CardTile[][]
  frontPages: number[][]
  answerPages: number[][]
  fullPages: number[][]
  cardsPageCount: number
  isEmpty: boolean
  total: number
  notesStartPageNo: number
  coverOutlineWithPages: CoverOutlineChapter[]
}

/**
 * Prepares the full document model, runs AI-preamble cleanup & scientific/math analysis,
 * paginates with orphan/widow keep-together and <25% last-page compaction, and computes
 * exact 1-based target page numbers for Cover & TOC links.
 */
export async function prepareStudyPdf(input: StudyPdfInput): Promise<PreparedStudyPdf> {
  await ensureFontsLoaded()
  if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const docLang = input.lang ?? (input.dir === 'rtl' ? 'ar' : 'en')

  // 1. Clean AI preambles and run math/science/typo diagnostics
  const { cleanedItems, warnings } = cleanAndAnalyzeOutline(input.items)
  const seenRuntimeErr = new Set<string>(warnings.map((w) => w.id))
  const recordMathError = (report: MathErrorReport) => {
    const key = `katex:runtime:${report.latex}`
    if (seenRuntimeErr.has(key)) return
    seenRuntimeErr.add(key)
    warnings.push({
      id: `w-rt-${seenRuntimeErr.size}`,
      kind: 'katex',
      location: 'LaTeX render',
      title: 'KaTeX formula error',
      detail: report.message,
      raw: report.latex,
    })
  }

  // 2. Build document representation from cleaned outline items
  const doc = buildStudyDoc({
    title: input.title,
    kind: input.kind,
    preset: input.preset,
    dir: input.dir,
    items: cleanedItems,
    include: input.include,
  })

  // 3. Measure and paginate notes flow (for presets 'notes' and 'summary')
  let notesPages: NotesPage[] = []
  let unitPageIndex: number[] = []
  let compactNotes = false

  if (input.preset === 'notes' || input.preset === 'summary') {
    const notesBody = bodyBoxPx(input.paper, 'notes')
    const measured = await measureFlow(
      doc.flow,
      notesBody.w,
      input.labels,
      input.include.aiTags,
      input.signal,
      { compact: false, docLang, onMathError: recordMathError },
    )
    notesPages = paginateFlow(measured, notesBody.h, doc.flow)

    // Density optimization: ensure non-final pages have <= 15% empty space (>= 85% filled)
    // and avoid a mostly blank tail page (< 25% of body height)
    const countSparseMiddle = (pages: NotesPage[], h: number) =>
      pages.slice(0, -1).filter((p) => (p.usedHeight ?? h) < h * 0.85).length
    const isSparseTail = (pages: NotesPage[], h: number) =>
      pages.length >= 2 && (pages[pages.length - 1]?.usedHeight ?? h) < h * 0.25

    if (
      notesPages.length >= 2 &&
      (isSparseTail(notesPages, notesBody.h) || countSparseMiddle(notesPages, notesBody.h) > 0)
    ) {
      const compactMeasured = await measureFlow(
        doc.flow,
        notesBody.w,
        input.labels,
        input.include.aiTags,
        input.signal,
        { compact: true, docLang, onMathError: recordMathError },
      )
      const compactPages = paginateFlow(compactMeasured, notesBody.h, doc.flow)
      const normBad =
        countSparseMiddle(notesPages, notesBody.h) + (isSparseTail(notesPages, notesBody.h) ? 1 : 0)
      const compactBad =
        countSparseMiddle(compactPages, notesBody.h) +
        (isSparseTail(compactPages, notesBody.h) ? 1 : 0)
      if (compactPages.length < notesPages.length || compactBad < normBad) {
        notesPages = compactPages
        compactNotes = true
      }
    }

    unitPageIndex = pageIndexOfUnits(notesPages, doc.flow.length)
  }

  // 4. Paginate Table of Contents ONLY when cover "What's inside" (max 8 sections) does not cover all sections
  const totalCoverSections = doc.coverOutline.reduce((sum, ch) => sum + ch.sections.length, 0)
  let tocPageEntries: number[][] = []
  if (totalCoverSections > 8 && doc.toc.length >= 2) {
    const tocBody = bodyBoxPx(input.paper, 'toc')
    tocPageEntries = paginateToc(
      doc.toc.map((e) => e.level),
      tocBody.h,
    )
  }
  const tocPageCount = tocPageEntries.length

  // 5. Map pages (strictly horizontal vector SVG maps; legacy raster fallback removed)
  const vectorMaps = input.preset === 'cards' ? [] : (input.mapPages ?? [])
  const mapPageCount = vectorMaps.length

  // 6. Flashcard pages (for preset 'cards')
  const pairedTiles: CardTile[][] = []
  let frontPages: number[][] = []
  let answerPages: number[][] = []
  let fullPages: number[][] = []
  let cardsPageCount = 0

  if (input.preset === 'cards' && doc.tiles.length > 0) {
    for (let i = 0; i < doc.tiles.length; i += 2) {
      pairedTiles.push(doc.tiles.slice(i, i + 2))
    }
    const cardsBody = bodyBoxPx(input.paper, 'cards')
    const cardWidth = Math.floor((cardsBody.w - PAD.cardGap - SHADOW_GUTTER) / 2)

    if (input.answersAtEnd) {
      const frontHeights = await measureCardRows(
        pairedTiles,
        cardWidth,
        input.labels,
        input.dir,
        'front',
        input.signal,
      )
      frontPages = paginateCardRows(frontHeights, cardsBody.h)

      const answerHeights = await measureCardRows(
        pairedTiles,
        cardWidth,
        input.labels,
        input.dir,
        'answer',
        input.signal,
      )
      answerPages = paginateCardRows(answerHeights, cardsBody.h)
      cardsPageCount = frontPages.length + answerPages.length
    } else {
      const fullHeights = await measureCardRows(
        pairedTiles,
        cardWidth,
        input.labels,
        input.dir,
        'full',
        input.signal,
      )
      fullPages = paginateCardRows(fullHeights, cardsBody.h)
      cardsPageCount = fullPages.length
    }
  }

  // 7. Totals and two-pass 1-based page number mapping for Cover & TOC
  const isEmpty = notesPages.length === 0 && mapPageCount === 0 && cardsPageCount === 0
  const emptyPageCount = isEmpty ? 1 : 0
  const total =
    1 + tocPageCount + mapPageCount + notesPages.length + cardsPageCount + emptyPageCount

  const notesStartPageNo = 1 + tocPageCount + mapPageCount + 1
  const tocRows = doc.toc.map((entry) => {
    const unitPageOffset = unitPageIndex[entry.unitIndex] ?? 0
    return {
      level: entry.level,
      label: entry.label,
      title: entry.title,
      color: entry.color,
      page: notesStartPageNo + unitPageOffset,
      dir: entry.dir,
    }
  })

  const coverOutlineWithPages: CoverOutlineChapter[] = doc.coverOutline.map((ch) => ({
    ...ch,
    sections: ch.sections.map((sec) => {
      if (sec.unitIndex === undefined) return sec
      const offset = unitPageIndex[sec.unitIndex]
      if (offset === undefined) return sec
      return { ...sec, page: notesStartPageNo + offset }
    }),
  }))

  input.onWarnings?.([...warnings])

  return {
    doc,
    docLang,
    warnings,
    recordMathError,
    compactNotes,
    notesPages,
    unitPageIndex,
    tocPageEntries,
    tocRows,
    vectorMaps,
    pairedTiles,
    frontPages,
    answerPages,
    fullPages,
    cardsPageCount,
    isEmpty,
    total,
    notesStartPageNo,
    coverOutlineWithPages,
  }
}

/**
 * Builds the complete MyNota Study PDF with balanced A4 cover & "What's inside" page links,
 * crisp landscape horizontal vector mind map(s), paginated study notes, and flashcards.
 */
export async function buildStudyPdf(input: StudyPdfInput): Promise<Blob> {
  if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  input.onProgress?.({ phase: 'prepare', done: 0, total: 1 })

  const prep = await prepareStudyPdf(input)
  const {
    doc,
    docLang,
    warnings,
    recordMathError,
    compactNotes,
    notesPages,
    tocPageEntries,
    tocRows,
    vectorMaps,
    pairedTiles,
    frontPages,
    answerPages,
    fullPages,
    cardsPageCount,
    isEmpty,
    total,
    notesStartPageNo,
    coverOutlineWithPages,
  } = prep

  // Initialize jsPDF with full document metadata
  const firstMm = pageSizeMm(input.paper, 'cover')
  const pdfDoc = new jsPDF({
    orientation: orientationOf(input.paper, 'cover'),
    unit: 'mm',
    format: [firstMm.w, firstMm.h],
    compress: true,
  })
  pdfDoc.setProperties({
    title: input.title,
    subject: `${input.labels.kind[input.kind]} · ${input.labels.sticker[input.preset]}`,
    creator: 'MyNota',
    keywords: 'MyNota, study notes, mind map',
  })
  pdfDoc.setCreationDate(new Date())

  // Render Cover Page (Page 1)
  let pageNo = 1
  const statChips: Array<{ key: StatKey; n: number; label: string }> = [
    { key: 'chapters', n: doc.stats.chapters, label: input.labels.stats.chapters },
    { key: 'sections', n: doc.stats.sections, label: input.labels.stats.sections },
    { key: 'blocks', n: doc.stats.blocks, label: input.labels.stats.blocks },
    { key: 'formulas', n: doc.stats.formulas, label: input.labels.stats.formulas },
    { key: 'cards', n: doc.stats.cards, label: input.labels.stats.cards },
  ]
  const coverSize = pageSizePx(input.paper, 'cover')
  const coverMm = pageSizeMm(input.paper, 'cover')
  const coverRes = await capturePageElement(
    React.createElement(CoverPage, {
      size: coverSize,
      tone: input.tone,
      dir: input.dir,
      title: input.title,
      kindLabel: input.labels.kind[input.kind],
      stickerLabel: input.labels.sticker[input.preset],
      stats: statChips,
      statLabel: input.labels.statLabel,
      tabs: doc.tabs,
      outline: coverOutlineWithPages,
      outlineLabel: input.labels.whatsInside ?? input.labels.contents,
      moreLabel: doc.tabs.length > 12 ? input.labels.more(doc.tabs.length - 12) : null,
      formatMore: input.labels.more,
      madeWith: input.labels.madeWith,
      dateLabel: input.dateLabel,
      docLang,
    }),
    coverSize,
    input.tone,
    input.signal,
    recordMathError,
  )
  pdfDoc.addImage(coverRes.dataUrl, 'PNG', 0, 0, coverMm.w, coverMm.h)
  for (const link of coverRes.links) {
    pdfDoc.link(link.x, link.y, link.w, link.h, { pageNumber: link.page })
  }
  input.onProgress?.({ phase: 'page', done: pageNo, total })

  // Render TOC Pages (only when > 8 sections overflow Cover outline)
  for (const tocIndices of tocPageEntries) {
    pageNo++
    const pageRows = tocIndices.flatMap((idx) => {
      const row = tocRows[idx]
      return row ? [row] : []
    })
    const tocSize = pageSizePx(input.paper, 'toc')
    const tocMm = pageSizeMm(input.paper, 'toc')
    const tocBody = bodyBoxPx(input.paper, 'toc')

    const res = await capturePageElement(
      React.createElement(TocPage, {
        size: tocSize,
        body: tocBody,
        tone: input.tone,
        dir: input.dir,
        headerTitle: input.title,
        pageNo,
        total,
        contentsLabel: input.labels.contents,
        rows: pageRows,
      }),
      tocSize,
      input.tone,
      input.signal,
      recordMathError,
    )

    pdfDoc.addPage([tocMm.w, tocMm.h], orientationOf(input.paper, 'toc'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, tocMm.w, tocMm.h)

    for (const link of res.links) {
      pdfDoc.link(link.x, link.y, link.w, link.h, { pageNumber: link.page })
    }
    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // Render Landscape Vector SVG Map Pages (single unified exporter path)
  const mapStartPageNo = pageNo + 1
  for (const mapPage of vectorMaps) {
    pageNo++
    const mapSize = pageSizePx(input.paper, 'map')
    const mapMm = pageSizeMm(input.paper, 'map')
    const mapBody = bodyBoxPx(input.paper, 'map')

    const res = await capturePageElement(
      React.createElement(VectorMapPage, {
        size: mapSize,
        body: mapBody,
        tone: input.tone,
        dir: input.dir,
        pageNo,
        total,
        pageData: mapPage,
        coreLabel: input.labels.importance.core,
        extraLabel: input.labels.importance.extra,
      }),
      mapSize,
      input.tone,
      input.signal,
      recordMathError,
    )

    pdfDoc.addPage([mapMm.w, mapMm.h], orientationOf(input.paper, 'map'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, mapMm.w, mapMm.h)
    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // Render Study Notes Pages
  for (const page of notesPages) {
    pageNo++
    const notesSize = pageSizePx(input.paper, 'notes')
    const notesMm = pageSizeMm(input.paper, 'notes')
    const notesBody = bodyBoxPx(input.paper, 'notes')
    const ch = doc.singleChapterCollapsed ? null : chapterForPage(page, doc.flow)
    const headerChapter = ch
      ? { label: input.labels.chapterShort(ch.number), title: ch.title, color: ch.color }
      : null

    const res = await capturePageElement(
      React.createElement(ContentPage, {
        size: notesSize,
        body: notesBody,
        tone: input.tone,
        dir: input.dir,
        headerTitle: input.title,
        headerChapter,
        headerTag: null,
        pageNo,
        total,
        children: page.placed.flatMap((pl, pIdx) => {
          const u = doc.flow[pl.unitIndex]
          if (!u) return []
          return [
            React.createElement(FlowUnitView, {
              key: pIdx,
              unit: u,
              dir: input.dir,
              labels: input.labels,
              aiTags: input.include.aiTags,
              atTop: pIdx === 0,
              rowFrom: pl.rowFrom,
              rowTo: pl.rowTo,
              continued: pl.continued,
              compact: compactNotes,
              docLang,
            }),
          ]
        }),
      }),
      notesSize,
      input.tone,
      input.signal,
      recordMathError,
    )

    pdfDoc.addPage([notesMm.w, notesMm.h], orientationOf(input.paper, 'notes'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, notesMm.w, notesMm.h)
    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // Render Cards Pages (for preset 'cards')
  const cardsSize = pageSizePx(input.paper, 'cards')
  const cardsMm = pageSizeMm(input.paper, 'cards')
  const cardsBody = bodyBoxPx(input.paper, 'cards')
  const cardWidth = Math.floor((cardsBody.w - PAD.cardGap - SHADOW_GUTTER) / 2)

  if (input.preset === 'cards') {
    if (input.answersAtEnd) {
      for (const rowGroup of frontPages) {
        pageNo++
        const res = await capturePageElement(
          React.createElement(ContentPage, {
            size: cardsSize,
            body: cardsBody,
            tone: input.tone,
            dir: input.dir,
            headerTitle: input.title,
            headerChapter: null,
            headerTag: input.labels.flashcards,
            pageNo,
            total,
            children: rowGroup.flatMap((rIdx) => {
              const tiles = pairedTiles[rIdx]
              if (!tiles) return []
              return [
                React.createElement(CardRowView, {
                  key: rIdx,
                  tiles,
                  mode: 'front',
                  labels: input.labels,
                  width: cardWidth,
                  dir: input.dir,
                }),
              ]
            }),
          }),
          cardsSize,
          input.tone,
          input.signal,
          recordMathError,
        )
        pdfDoc.addPage([cardsMm.w, cardsMm.h], orientationOf(input.paper, 'cards'))
        pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, cardsMm.w, cardsMm.h)
        input.onProgress?.({ phase: 'page', done: pageNo, total })
      }

      for (const rowGroup of answerPages) {
        pageNo++
        const res = await capturePageElement(
          React.createElement(ContentPage, {
            size: cardsSize,
            body: cardsBody,
            tone: input.tone,
            dir: input.dir,
            headerTitle: input.title,
            headerChapter: null,
            headerTag: input.labels.answers,
            pageNo,
            total,
            children: rowGroup.flatMap((rIdx) => {
              const tiles = pairedTiles[rIdx]
              if (!tiles) return []
              return [
                React.createElement(CardRowView, {
                  key: rIdx,
                  tiles,
                  mode: 'answer',
                  labels: input.labels,
                  width: cardWidth,
                  dir: input.dir,
                }),
              ]
            }),
          }),
          cardsSize,
          input.tone,
          input.signal,
          recordMathError,
        )
        pdfDoc.addPage([cardsMm.w, cardsMm.h], orientationOf(input.paper, 'answers'))
        pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, cardsMm.w, cardsMm.h)
        input.onProgress?.({ phase: 'page', done: pageNo, total })
      }
    } else {
      for (const rowGroup of fullPages) {
        pageNo++
        const res = await capturePageElement(
          React.createElement(ContentPage, {
            size: cardsSize,
            body: cardsBody,
            tone: input.tone,
            dir: input.dir,
            headerTitle: input.title,
            headerChapter: null,
            headerTag: input.labels.flashcards,
            pageNo,
            total,
            children: rowGroup.flatMap((rIdx) => {
              const tiles = pairedTiles[rIdx]
              if (!tiles) return []
              return [
                React.createElement(CardRowView, {
                  key: rIdx,
                  tiles,
                  mode: 'full',
                  labels: input.labels,
                  width: cardWidth,
                  dir: input.dir,
                }),
              ]
            }),
          }),
          cardsSize,
          input.tone,
          input.signal,
          recordMathError,
        )
        pdfDoc.addPage([cardsMm.w, cardsMm.h], orientationOf(input.paper, 'cards'))
        pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, cardsMm.w, cardsMm.h)
        input.onProgress?.({ phase: 'page', done: pageNo, total })
      }
    }
  }

  // Render empty placeholder page if needed
  if (isEmpty) {
    pageNo++
    const notesSize = pageSizePx(input.paper, 'notes')
    const notesMm = pageSizeMm(input.paper, 'notes')
    const notesBody = bodyBoxPx(input.paper, 'notes')
    const res = await capturePageElement(
      React.createElement(ContentPage, {
        size: notesSize,
        body: notesBody,
        tone: input.tone,
        dir: input.dir,
        headerTitle: input.title,
        headerChapter: null,
        headerTag: null,
        pageNo,
        total,
        children: React.createElement(
          'div',
          {
            style: {
              padding: 40,
              textAlign: 'center',
              color: COLORS.charcoal,
              fontSize: 16,
              fontWeight: 500,
            },
          },
          input.labels.empty,
        ),
      }),
      notesSize,
      input.tone,
      input.signal,
      recordMathError,
    )
    pdfDoc.addPage([notesMm.w, notesMm.h], orientationOf(input.paper, 'notes'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, notesMm.w, notesMm.h)
    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // Emit any late runtime KaTeX warnings caught during page capture
  if (warnings.length > 0) {
    input.onWarnings?.([...warnings])
  }

  // Document Outline / Bookmarks
  if (pdfDoc.outline) {
    pdfDoc.outline.add(null, input.title, { pageNumber: 1 })
    if (tocPageEntries.length > 0) {
      pdfDoc.outline.add(null, input.labels.contents, { pageNumber: 2 })
    }
    let mNo = mapStartPageNo
    for (const vm of vectorMaps) {
      pdfDoc.outline.add(null, vm.caption || 'Map', { pageNumber: mNo })
      mNo++
    }
    type OutlineNode = ReturnType<typeof pdfDoc.outline.add>
    let curChapterBookmark: OutlineNode | null = null
    for (const entry of tocRows) {
      if (entry.level === 'chapter') {
        curChapterBookmark = pdfDoc.outline.add(null, `${entry.label}. ${entry.title}`, {
          pageNumber: entry.page,
        })
      } else {
        pdfDoc.outline.add(curChapterBookmark, `${entry.label} ${entry.title}`, {
          pageNumber: entry.page,
        })
      }
    }
    if (cardsPageCount > 0) {
      const cardsStart = notesStartPageNo + notesPages.length
      pdfDoc.outline.add(null, input.labels.flashcards, { pageNumber: cardsStart })
    }
  }

  return pdfDoc.output('blob')
}
