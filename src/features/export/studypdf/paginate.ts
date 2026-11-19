import type { ChapterUnit, FlowUnit, MeasuredUnit, NotesPage, Placed } from './types'

export const TOC_TITLE_BLOCK = 64
export const TOC_ROW_CHAPTER = 32
export const TOC_ROW_SECTION = 26

export function paginateFlow(
  units: MeasuredUnit[],
  bodyHeight: number,
  flow?: FlowUnit[],
): NotesPage[] {
  const pages: NotesPage[] = []
  let current: Placed[] = []
  let used = 0

  const rowCount = (u: MeasuredUnit): number => (u.split ? u.split.rows.length : 0)

  const partHeight = (u: MeasuredUnit, from: number, to: number): number => {
    if (!u.split) return u.height
    const split = u.split
    let sum = 0
    for (let r = from; r < to; r++) {
      sum += split.rows[r] ?? 0
    }
    const gaps = Math.max(0, to - from - 1)
    return split.base + split.head + sum + split.gap * gaps
  }

  const flush = () => {
    if (current.length > 0) {
      pages.push({ placed: current, usedHeight: used })
      current = []
      used = 0
    }
  }

  const n = units.length
  for (let i = 0; i < n; i++) {
    const unit = units[i]
    if (!unit) continue

    let atTop = current.length === 0

    // 3. Group
    let end = Math.min(n - 1, i + unit.keepWithNext)
    const minFollowerHeight = (u: MeasuredUnit): number =>
      u.split ? u.split.base + u.split.head + (u.split.rows[0] ?? 0) : u.height
    const minSelfHeight = (top: boolean): number =>
      unit.split && unit.split.rows.length > 1
        ? unit.split.base + unit.split.head + (unit.split.rows[0] ?? 0)
        : unit.height - (top ? unit.padTop : 0)
    const calcGroupSum = (toIdx: number, top: boolean): number => {
      let sum = minSelfHeight(top)
      for (let k = i + 1; k <= toIdx; k++) {
        const u = units[k]
        if (u) sum += minFollowerHeight(u)
      }
      return sum
    }

    let groupSum = calcGroupSum(end, atTop)
    while (end > i && groupSum > bodyHeight) {
      end--
      groupSum = calcGroupSum(end, atTop)
    }

    // 4. If not atTop and used + groupSum > bodyHeight: flush
    if (!atTop && used + groupSum > bodyHeight) {
      flush()
      atTop = true
    }

    // 5. Check if unit fits
    let h = unit.height - (atTop ? unit.padTop : 0)
    const totalRows = rowCount(unit)

    if (used + h <= bodyHeight) {
      current.push({
        unitIndex: i,
        rowFrom: 0,
        rowTo: totalRows,
        continued: false,
      })
      used += h
      continue
    }

    // 6. If splittable and at least row 0 fits right after prior headings on this page, start splitting here;
    // otherwise flush first if not already at top of a page.
    const minFirstSlice = unit.split ? partHeight(unit, 0, 1) : h
    if (!atTop && (totalRows <= 1 || used + minFirstSlice > bodyHeight)) {
      flush()
      h = unit.height - unit.padTop
      if (used + h <= bodyHeight) {
        current.push({
          unitIndex: i,
          rowFrom: 0,
          rowTo: totalRows,
          continued: false,
        })
        used += h
        continue
      }
    }

    // 7. Still too tall on empty page and rowCount <= 1: place whole
    if (totalRows <= 1) {
      current.push({
        unitIndex: i,
        rowFrom: 0,
        rowTo: totalRows,
        continued: false,
      })
      used = bodyHeight
      continue
    }

    // 8. Otherwise split it (keeping atomic pairs like cardsHead + first card together)
    const flowUnit = flow?.[i]
    const blockRows = flowUnit && flowUnit.kind === 'block' ? flowUnit.rows : null
    let from = 0
    let continued = false
    while (from < totalRows) {
      const avail = bodyHeight - used
      let to = from + 1
      while (to < totalRows && partHeight(unit, from, to + 1) <= avail) {
        to++
      }
      // Prevent stranding a section/cardsHead label right at the bottom of a slice
      if (to < totalRows && to - from > 1 && blockRows?.[to - 1]?.kind === 'cardsHead') {
        to--
      }

      current.push({
        unitIndex: i,
        rowFrom: from,
        rowTo: to,
        continued,
      })
      used += partHeight(unit, from, to)
      from = to
      continued = true
      if (from < totalRows) {
        flush()
      }
    }
  }

  flush()
  return pages
}

export function paginateToc(levels: Array<'chapter' | 'section'>, bodyHeight: number): number[][] {
  if (levels.length === 0) return []

  const capacity = bodyHeight - TOC_TITLE_BLOCK
  const pages: number[][] = []
  let currentPage: number[] = []
  let currentUsed = 0

  for (let idx = 0; idx < levels.length; idx++) {
    const level = levels[idx]
    const rowH = level === 'chapter' ? TOC_ROW_CHAPTER : TOC_ROW_SECTION
    if (currentPage.length > 0 && currentUsed + rowH > capacity) {
      pages.push(currentPage)
      currentPage = []
      currentUsed = 0
    }
    currentPage.push(idx)
    currentUsed += rowH
  }

  if (currentPage.length > 0) {
    pages.push(currentPage)
  }

  return pages
}

export function pageIndexOfUnits(pages: NotesPage[], unitCount: number): number[] {
  const result: number[] = new Array(unitCount).fill(0)
  const seen = new Set<number>()

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx]
    if (!page) continue
    for (const pl of page.placed) {
      if (!pl.continued && !seen.has(pl.unitIndex)) {
        result[pl.unitIndex] = pageIdx
        seen.add(pl.unitIndex)
      }
    }
  }

  return result
}

export function chapterForPage(page: NotesPage, units: FlowUnit[]): ChapterUnit | null {
  const first = page.placed[0]
  if (!first) return null

  for (let idx = first.unitIndex; idx >= 0; idx--) {
    const u = units[idx]
    if (u && u.kind === 'chapter') {
      return u
    }
  }

  return null
}
