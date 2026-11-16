import { toPng } from 'html-to-image'
import type React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { COLORS, PX_PER_MM } from './tokens'
import type { PaperTone } from './types'

export interface RenderPageResult {
  dataUrl: string
  /** Clickable link areas on the page (in mm). */
  links: Array<{ x: number; y: number; w: number; h: number; page: number }>
  /** Map picture slot (in mm) if this is a map page. */
  mapSlot?: { x: number; y: number; w: number; h: number }
}

const FALLBACK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * Mounts a React page component into an offscreen container, extracts link/slot positions,
 * and captures it to a high-resolution PNG data URL with pixelRatio: 2.
 */
export async function capturePageElement(
  element: React.ReactElement,
  sizePx: { w: number; h: number },
  tone: PaperTone,
  signal?: AbortSignal,
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
      root.render(element)
    })

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const pageEl = (container.firstElementChild as HTMLElement) || container
    const pageRect = pageEl.getBoundingClientRect()

    // 1. Clickable TOC link targets
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

    // 2. Map picture slot
    let mapSlot: { x: number; y: number; w: number; h: number } | undefined
    const slotEl = pageEl.querySelector('[data-slot="picture"]')
    if (slotEl) {
      const sRect = slotEl.getBoundingClientRect()
      mapSlot = {
        x: (sRect.left - pageRect.left) / PX_PER_MM,
        y: (sRect.top - pageRect.top) / PX_PER_MM,
        w: sRect.width / PX_PER_MM,
        h: sRect.height / PX_PER_MM,
      }
    }

    // 3. Render page node to PNG
    const bg = tone === 'mint' ? COLORS.mintFrost : COLORS.white
    let dataUrl = ''
    try {
      dataUrl = await toPng(pageEl, {
        pixelRatio: 2,
        backgroundColor: bg,
        cacheBust: false,
      })
    } catch {
      dataUrl = FALLBACK_PNG
    }

    return { dataUrl, links, mapSlot }
  } finally {
    root.unmount()
    host.remove()
  }
}
