import { jsPDF } from 'jspdf'
import React from 'react'
import { CardRowView, ContentPage, CoverPage, FlowUnitView, MapSlot, TocPage } from './components'
import { ensureFontsLoaded, measureCardRows, measureFlow, paginateCardRows } from './measure'
import { buildStudyDoc } from './model'
import { chapterForPage, pageIndexOfUnits, paginateFlow, paginateToc } from './paginate'
import { capturePageElement } from './render'
import { bodyBoxPx, COLORS, orientationOf, pageSizeMm, pageSizePx, PAD, PX_PER_MM } from './tokens'
import type { CardTile, NotesPage, StudyPdfInput } from './types'

export * from './tokens'
export * from './types'
export * from './model'
export * from './paginate'
export * from './components'
export * from './measure'
export * from './render'

/**
 * Builds the complete Perfusense neo-brutalist Study PDF with cover page,
 * clickable TOC page(s), high-resolution map pages, study-note pages, and flashcards.
 */
export async function buildStudyPdf(input: StudyPdfInput): Promise<Blob> {
  await ensureFontsLoaded()
  if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  input.onProgress?.({ phase: 'prepare', done: 0, total: 1 })

  // 1. Build document representation from outline items
  const doc = buildStudyDoc({
    title: input.title,
    kind: input.kind,
    preset: input.preset,
    dir: input.dir,
    items: input.items,
    include: input.include,
  })

  // 2. Measure and paginate notes flow (for presets 'notes' and 'summary')
  let notesPages: NotesPage[] = []
  let unitPageIndex: number[] = []

  if (input.preset === 'notes' || input.preset === 'summary') {
    const notesBody = bodyBoxPx(input.paper, 'notes')
    const measured = await measureFlow(
      doc.flow,
      notesBody.w,
      input.labels,
      input.include.aiTags,
      input.signal,
    )
    notesPages = paginateFlow(measured, notesBody.h)
    unitPageIndex = pageIndexOfUnits(notesPages, doc.flow.length)
  }

  // 3. Paginate Table of Contents (if at least 2 entries exist)
  let tocPageEntries: number[][] = []
  if (doc.toc.length >= 2) {
    const tocBody = bodyBoxPx(input.paper, 'toc')
    tocPageEntries = paginateToc(
      doc.toc.map((e) => e.level),
      tocBody.h,
    )
  }
  const tocPageCount = tocPageEntries.length

  // 4. Map pages
  const mapPictures = input.preset === 'cards' ? [] : input.pictures
  const mapPageCount = mapPictures.length

  // 5. Flashcard pages (for preset 'cards')
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
    const cardWidth = Math.floor((cardsBody.w - PAD.cardGap - 4) / 2)

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

  // 6. Calculate total page count and page offsets
  const isEmpty = notesPages.length === 0 && mapPageCount === 0 && cardsPageCount === 0
  const emptyPageCount = isEmpty ? 1 : 0
  const total =
    1 + tocPageCount + mapPageCount + notesPages.length + cardsPageCount + emptyPageCount

  // Map TOC entries to their 1-based target page numbers
  const notesStartPageNo = 1 + tocPageCount + mapPageCount + 1
  const tocRows = doc.toc.map((entry) => {
    const unitPageOffset = unitPageIndex[entry.unitIndex] ?? 0
    const targetPage = notesStartPageNo + unitPageOffset
    return {
      level: entry.level,
      label: entry.label,
      title: entry.title,
      color: entry.color,
      page: targetPage,
      dir: entry.dir,
    }
  })

  // 7. Initialize jsPDF
  const firstMm = pageSizeMm(input.paper, 'cover')
  const pdfDoc = new jsPDF({
    orientation: orientationOf(input.paper, 'cover'),
    unit: 'mm',
    format: [firstMm.w, firstMm.h],
    compress: true,
  })
  pdfDoc.setProperties({ title: input.title, creator: 'MyNota' })

  // 8. Render Cover Page (Page 1)
  let pageNo = 1
  const statChips = [
    { n: doc.stats.chapters, label: input.labels.stats.chapters },
    { n: doc.stats.sections, label: input.labels.stats.sections },
    { n: doc.stats.blocks, label: input.labels.stats.blocks },
    { n: doc.stats.formulas, label: input.labels.stats.formulas },
    { n: doc.stats.cards, label: input.labels.stats.cards },
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
      tabs: doc.tabs,
      outline: doc.coverOutline,
      outlineLabel: input.labels.contents,
      moreLabel: doc.tabs.length > 12 ? input.labels.more(doc.tabs.length - 12) : null,
      formatMore: input.labels.more,
      madeWith: input.labels.madeWith,
    }),
    coverSize,
    input.tone,
    input.signal,
  )
  pdfDoc.addImage(coverRes.dataUrl, 'PNG', 0, 0, coverMm.w, coverMm.h)
  input.onProgress?.({ phase: 'page', done: pageNo, total })

  // 9. Render TOC Pages
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
    )

    pdfDoc.addPage([tocMm.w, tocMm.h], orientationOf(input.paper, 'toc'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, tocMm.w, tocMm.h)

    for (const link of res.links) {
      pdfDoc.link(link.x, link.y, link.w, link.h, { pageNumber: link.page })
    }
    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // 10. Render Map Pages
  for (const pic of mapPictures) {
    pageNo++
    const mapSize = pageSizePx(input.paper, 'map')
    const mapMm = pageSizeMm(input.paper, 'map')
    const mapBody = bodyBoxPx(input.paper, 'map')

    const res = await capturePageElement(
      React.createElement(ContentPage, {
        size: mapSize,
        body: mapBody,
        tone: input.tone,
        dir: input.dir,
        headerTitle: input.title,
        headerChapter: null,
        headerTag: null,
        pageNo,
        total,
        children: React.createElement(MapSlot, { size: mapBody, caption: pic.caption }),
      }),
      mapSize,
      input.tone,
      input.signal,
    )

    pdfDoc.addPage([mapMm.w, mapMm.h], orientationOf(input.paper, 'map'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, mapMm.w, mapMm.h)

    const slot = res.mapSlot ?? {
      x: mapBody.x / PX_PER_MM,
      y: mapBody.y / PX_PER_MM,
      w: mapBody.w / PX_PER_MM,
      h: mapBody.h / PX_PER_MM,
    }
    const scale = Math.min(slot.w / pic.width, slot.h / pic.height)
    const fitW = pic.width * scale
    const fitH = pic.height * scale
    const fitX = slot.x + (slot.w - fitW) / 2
    const fitY = slot.y + (slot.h - fitH) / 2
    pdfDoc.addImage(pic.dataUrl, 'PNG', fitX, fitY, fitW, fitH)

    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // 11. Render Study Notes Pages
  for (const page of notesPages) {
    pageNo++
    const notesSize = pageSizePx(input.paper, 'notes')
    const notesMm = pageSizeMm(input.paper, 'notes')
    const notesBody = bodyBoxPx(input.paper, 'notes')
    const ch = chapterForPage(page, doc.flow)
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
            }),
          ]
        }),
      }),
      notesSize,
      input.tone,
      input.signal,
    )

    pdfDoc.addPage([notesMm.w, notesMm.h], orientationOf(input.paper, 'notes'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, notesMm.w, notesMm.h)
    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // 12. Render Cards Pages (for preset 'cards')
  const cardsSize = pageSizePx(input.paper, 'cards')
  const cardsMm = pageSizeMm(input.paper, 'cards')
  const cardsBody = bodyBoxPx(input.paper, 'cards')
  const cardWidth = Math.floor((cardsBody.w - PAD.cardGap - 4) / 2)

  if (input.preset === 'cards') {
    if (input.answersAtEnd) {
      // Questions (front mode)
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
        )
        pdfDoc.addPage([cardsMm.w, cardsMm.h], orientationOf(input.paper, 'cards'))
        pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, cardsMm.w, cardsMm.h)
        input.onProgress?.({ phase: 'page', done: pageNo, total })
      }

      // Answers (answer mode)
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
        )
        pdfDoc.addPage([cardsMm.w, cardsMm.h], orientationOf(input.paper, 'answers'))
        pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, cardsMm.w, cardsMm.h)
        input.onProgress?.({ phase: 'page', done: pageNo, total })
      }
    } else {
      // Combined (full mode)
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
        )
        pdfDoc.addPage([cardsMm.w, cardsMm.h], orientationOf(input.paper, 'cards'))
        pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, cardsMm.w, cardsMm.h)
        input.onProgress?.({ phase: 'page', done: pageNo, total })
      }
    }
  }

  // 13. Render empty placeholder page if needed
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
    )
    pdfDoc.addPage([notesMm.w, notesMm.h], orientationOf(input.paper, 'notes'))
    pdfDoc.addImage(res.dataUrl, 'PNG', 0, 0, notesMm.w, notesMm.h)
    input.onProgress?.({ phase: 'page', done: pageNo, total })
  }

  // 14. Document Outline / Bookmarks
  if (pdfDoc.outline) {
    pdfDoc.outline.add(null, input.title, { pageNumber: 1 })
    if (tocPageCount > 0) {
      pdfDoc.outline.add(null, input.labels.contents, { pageNumber: 2 })
    }
    if (mapPictures.length > 0) {
      let mNo = 2 + tocPageCount
      for (const pic of mapPictures) {
        pdfDoc.outline.add(null, pic.caption || 'Map', { pageNumber: mNo })
        mNo++
      }
    }
    // Structure TOC bookmarks with chapters and sections
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
