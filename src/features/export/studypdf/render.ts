import { toPng } from 'html-to-image'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { MathErrorProvider, type MathErrorReport } from '@/components/ui/MathFormula'
import { COLORS, PX_PER_MM } from './tokens'
import type { PaperTone } from './types'

export interface RenderPageResult {
  dataUrl: string
  /** Clickable link areas on the page (in mm). */
  links: Array<{ x: number; y: number; w: number; h: number; page: number }>
}

const FALLBACK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * Mounts a React page component into an offscreen container, extracts link positions,
 * and captures it to a crisp PNG data URL.
 */
export async function capturePageElement(
  element: React.ReactElement,
  sizePx: { w: number; h: number },
  tone: PaperTone,
  signal?: AbortSignal,
  onMathError?: (e: MathErrorReport) => void,
  pixelRatio = 2.5,
): Promise<RenderPageResult> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (typeof document === 'undefined') {
    return { dataUrl: FALLBACK_PNG, links: [] }
  }

  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${sizePx.w}px;height:${sizePx.h}px;overflow:hidden;pointer-events:none;box-sizing:border-box;margin:0;`
  document.body.appendChild(host)

  const container = document.createElement('div')
  container.style.cssText = `width:${sizePx.w}px;height:${sizePx.h}px;overflow:hidden;box-sizing:border-box;margin:0;`
  host.appendChild(container)

  const root = createRoot(container)
  try {
    flushSync(() => {
      root.render(
        React.createElement(MathErrorProvider, {
          onError: onMathError ?? (() => {}),
          children: element,
        }),
      )
    })

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const pageEl = (container.firstElementChild as HTMLElement) || container
    const pageRect = pageEl.getBoundingClientRect()

    // Clickable TOC / Cover link targets
    const links: Array<{ x: number; y: number; w: number; h: number; page: number }> = []
    const tocRows = pageEl.querySelectorAll('[data-toc-page]')
    for (const row of Array.from(tocRows)) {
      const target = Number(row.getAttribute('data-toc-page'))
      if (!isNaN(target) && target > 0) {
        const rRect = row.getBoundingClientRect()
        links.push({
          x: (rRect.left - pageRect.left) / PX_PER_MM,
          y: (rRect.top - pageRect.top) / PX_PER_MM,
          w: rRect.width / PX_PER_MM,
          h: rRect.height / PX_PER_MM,
          page: target,
        })
      }
    }

    // Render page node to PNG
    const bg = tone === 'mint' ? COLORS.mintFrost : COLORS.white
    let dataUrl = ''
    try {
      dataUrl = await toPng(pageEl, {
        pixelRatio,
        backgroundColor: bg,
        cacheBust: false,
      })
    } catch {
      dataUrl = FALLBACK_PNG
    }

    return { dataUrl, links }
  } finally {
    root.unmount()
    host.remove()
  }
}
