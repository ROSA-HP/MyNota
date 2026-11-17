import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { FONT_LOAD_SPECS, PAD } from './tokens'
import type { CardTile, FlowUnit, MeasuredUnit, StudyLabels } from './types'
import { CardRowView, FlowUnitView } from './components'

/**
 * Ensures all typography fonts needed for crisp, deterministic canvas/PDF rendering
 * are fully loaded before measuring or rasterizing pages.
 */
export async function ensureFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  try {
    await Promise.all(
      FONT_LOAD_SPECS.map(([spec, sample]) => document.fonts.load(spec, sample).catch(() => [])),
    )
    await document.fonts.ready
  } catch {
    // Gracefully proceed in environments where network font loading is unavailable
  }
}

/** Fallback estimation used in headless test environments without DOM layout engine. */
function fallbackMeasure(u: FlowUnit): MeasuredUnit {
  if (u.kind === 'chapter') {
    return {
      height: PAD.chapterTop + PAD.chapterBottom + 64 + (u.summary ? 32 : 0),
      padTop: PAD.chapterTop,
      keepWithNext: 2,
      split: null,
    }
  }
  if (u.kind === 'section') {
    return {
      height: PAD.sectionTop + PAD.sectionBottom + 32 + (u.summary ? 24 : 0),
      padTop: PAD.sectionTop,
      keepWithNext: 1,
      split: null,
    }
  }
  // Block unit
  if (u.rows.length <= 1) {
    return {
      height: 36 + 16 + (u.rows.length ? 24 : 0),
      padTop: 0,
      keepWithNext: 0,
      split: null,
    }
  }
  const head = 36
  const rows = u.rows.map(() => 24)
  const base = 16
  const gap = PAD.rowGap
  const height = head + base + rows.reduce((a, b) => a + b, 0) + gap * (rows.length - 1)
  return {
    height,
    padTop: 0,
    keepWithNext: 0,
    split: { head, rows, base, gap },
  }
}

/**
 * Renders flow units offscreen into a hidden container with exact body width,
 * measuring DOM layout heights and split boundaries for block rows.
 */
export async function measureFlow(
  units: FlowUnit[],
  bodyWidth: number,
  labels: StudyLabels,
  aiTags: boolean,
  signal?: AbortSignal,
): Promise<MeasuredUnit[]> {
  if (units.length === 0) return []
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (typeof document === 'undefined') {
    return units.map((u) => fallbackMeasure(u))
  }

  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${bodyWidth}px;visibility:hidden;pointer-events:none;box-sizing:border-box;margin:0;`
  document.body.appendChild(host)

  const container = document.createElement('div')
  container.style.cssText = `width:${bodyWidth}px;box-sizing:border-box;margin:0;`
  host.appendChild(container)

  const root = createRoot(container)
  try {
    flushSync(() => {
      root.render(
        React.createElement(
          'div',
          { style: { width: bodyWidth, boxSizing: 'border-box', margin: 0 } },
          units.map((u, i) =>
            React.createElement(
              'div',
              { key: i, 'data-unit-index': i, style: { boxSizing: 'border-box', margin: 0 } },
              React.createElement(FlowUnitView, {
                unit: u,
                dir: u.dir,
                labels,
                aiTags,
                atTop: false,
              }),
            ),
          ),
        ),
      )
    })

    const results: MeasuredUnit[] = []
    for (let i = 0; i < units.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const u = units[i]
      if (!u) continue
      const el = container.querySelector(`[data-unit-index="${i}"]`) as HTMLElement | null
      const rectH = el ? Math.ceil(el.getBoundingClientRect().height || el.offsetHeight) : 0

      if (!el || rectH === 0) {
        results.push(fallbackMeasure(u))
        continue
      }

      if (u.kind === 'chapter') {
        results.push({
          height: rectH,
          padTop: PAD.chapterTop,
          keepWithNext: 2,
          split: null,
        })
      } else if (u.kind === 'section') {
        results.push({
          height: rectH,
          padTop: PAD.sectionTop,
          keepWithNext: 1,
          split: null,
        })
      } else {
        // Block unit
        if (u.rows.length <= 1) {
          results.push({
            height: rectH,
            padTop: 0,
            keepWithNext: 0,
            split: null,
          })
        } else {
          const headEl = el.querySelector('[data-part="head"]') as HTMLElement | null
          const head = headEl
            ? Math.ceil(headEl.getBoundingClientRect().height || headEl.offsetHeight)
            : 36
          const rowEls = el.querySelectorAll('[data-row]')
          const rows = Array.from(rowEls).map((r) =>
            Math.ceil(r.getBoundingClientRect().height || (r as HTMLElement).offsetHeight || 24),
          )
          const gap = PAD.rowGap
          const rowSum = rows.reduce((a, b) => a + b, 0)
          const gapTotal = gap * Math.max(0, rows.length - 1)
          const base = Math.max(0, rectH - head - rowSum - gapTotal)

          results.push({
            height: rectH,
            padTop: 0,
            keepWithNext: 0,
            split: {
              head,
              rows,
              base,
              gap,
            },
          })
        }
      }
    }
    return results
  } finally {
    root.unmount()
    host.remove()
  }
}

/**
 * Measures CardRowView elements offscreen to paginate card tiles without overflow.
 */
export async function measureCardRows(
  rows: CardTile[][],
  cardWidth: number,
  labels: StudyLabels,
  dir: 'ltr' | 'rtl',
  mode: 'full' | 'front' | 'answer',
  signal?: AbortSignal,
): Promise<number[]> {
  if (rows.length === 0) return []
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (typeof document === 'undefined') {
    return rows.map(() => (mode === 'full' ? 110 : mode === 'front' ? 70 : 60) + PAD.cardRowBottom)
  }

  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${cardWidth * 2 + PAD.cardGap}px;visibility:hidden;pointer-events:none;box-sizing:border-box;margin:0;`
  document.body.appendChild(host)

  const container = document.createElement('div')
  host.appendChild(container)
  const root = createRoot(container)

  try {
    flushSync(() => {
      root.render(
        React.createElement(
          'div',
          { style: { boxSizing: 'border-box', margin: 0 } },
          rows.map((r, i) =>
            React.createElement(
              'div',
              { key: i, 'data-card-row': i, style: { boxSizing: 'border-box', margin: 0 } },
              React.createElement(CardRowView, {
                tiles: r,
                mode,
                labels,
                width: cardWidth,
                dir,
              }),
            ),
          ),
        ),
      )
    })

    const heights: number[] = []
    for (let i = 0; i < rows.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const el = container.querySelector(`[data-card-row="${i}"]`) as HTMLElement | null
      const rectH = el ? Math.ceil(el.getBoundingClientRect().height || el.offsetHeight) : 0
      heights.push(
        rectH > 0
          ? rectH
          : (mode === 'full' ? 110 : mode === 'front' ? 70 : 60) + PAD.cardRowBottom,
      )
    }
    return heights
  } finally {
    root.unmount()
    host.remove()
  }
}

/** Greedily groups card row indices into pages that fit within bodyHeight. */
export function paginateCardRows(rowHeights: number[], bodyHeight: number): number[][] {
  const pages: number[][] = []
  let cur: number[] = []
  let used = 0

  for (let i = 0; i < rowHeights.length; i++) {
    const h = rowHeights[i] ?? 0
    if (cur.length > 0 && used + h > bodyHeight) {
      pages.push(cur)
      cur = []
      used = 0
    }
    cur.push(i)
    used += h
  }
  if (cur.length > 0) {
    pages.push(cur)
  }
  return pages
}
