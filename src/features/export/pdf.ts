import type { OutlineItem } from './outline'

export type Paper = 'a4-landscape' | 'a4-portrait' | 'letter-landscape'

/** Page size in mm. */
const PAPER: Record<Paper, { w: number; h: number; format: 'a4' | 'letter' }> = {
  'a4-landscape': { w: 297, h: 210, format: 'a4' },
  'a4-portrait': { w: 210, h: 297, format: 'a4' },
  'letter-landscape': { w: 279.4, h: 215.9, format: 'letter' },
}
const MARGIN_MM = 12
/** CSS pixels per mm when laying out outline pages (96 dpi). */
const PX_PER_MM = 96 / 25.4

export interface PdfInput {
  title: string
  paper: Paper
  /** Map pictures, one page each (the whole map, or one per chapter of a book). */
  pictures: Array<{ dataUrl: string; width: number; height: number; caption: string }>
  outline: OutlineItem[]
  dir: 'ltr' | 'rtl'
  labels: { outline: string; cards: string; footer: string }
}

/** Builds the outline as page-sized blocks of real browser text (so Arabic shapes correctly). */
function outlineElements(items: OutlineItem[], labels: PdfInput['labels']): HTMLElement[] {
  const make = (tag: string, text: string, css: string) => {
    const el = document.createElement(tag)
    el.textContent = text
    el.setAttribute('dir', 'auto')
    el.style.cssText = css
    return el
  }
  const sectionDepth = items.find((i) => i.level === 'section')?.depth ?? 1
  return items.map((it) => {
    const box = document.createElement('div')
    const indent = Math.max(0, it.depth - sectionDepth) * 16
    box.style.cssText = `padding-inline-start:${indent}px;margin:0 0 6px;break-inside:avoid`
    const heading = it.level !== 'block'
    const size = it.depth === 0 ? 22 : heading ? (it.depth <= 1 ? 17 : 15) : 13
    box.append(
      make(
        'div',
        it.title,
        `font-weight:700;font-size:${size}px;line-height:1.3;${heading ? 'margin-top:8px;' : ''}`,
      ),
    )
    if (it.summary)
      box.append(make('div', it.summary, 'font-size:12px;color:#374140;line-height:1.4'))
    for (const d of it.details)
      box.append(make('div', `• ${d}`, 'font-size:12px;line-height:1.4;padding-inline-start:10px'))
    for (const l of it.links)
      box.append(
        make(
          'div',
          `${l.outgoing ? '→' : '←'} ${l.label}: ${l.other}`,
          'font-size:11.5px;color:#0f766e;line-height:1.4;padding-inline-start:10px',
        ),
      )
    if (it.cards.length) {
      box.append(
        make(
          'div',
          labels.cards,
          'font-size:11px;font-weight:700;color:#5c6865;padding-inline-start:10px;margin-top:2px',
        ),
      )
      for (const c of it.cards)
        box.append(
          make(
            'div',
            `${c.front} — ${c.back}`,
            'font-size:11.5px;line-height:1.4;padding-inline-start:20px',
          ),
        )
    }
    return box
  })
}

/**
 * PDF: the map picture(s) first, then the outline. Outline pages are laid out by the browser and
 * added as images, which keeps Arabic, German and formulas exactly as on screen.
 */
export async function buildPdf(input: PdfInput): Promise<Blob> {
  const [{ jsPDF }, { toPng }] = await Promise.all([import('jspdf'), import('html-to-image')])
  const paper = PAPER[input.paper]
  const landscape = paper.w > paper.h
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: paper.format,
    compress: true,
  })
  doc.setProperties({ title: input.title, creator: 'MyNota' })
  const innerW = paper.w - MARGIN_MM * 2
  const innerH = paper.h - MARGIN_MM * 2
  let first = true
  const newPage = () => {
    if (!first) doc.addPage(paper.format, landscape ? 'landscape' : 'portrait')
    first = false
  }

  // 1. Map pictures, each fitted to a page with a small caption above.
  for (const pic of input.pictures) {
    newPage()
    const caption = await textImage(pic.caption, innerW * PX_PER_MM, input.dir, toPng)
    const capH = caption.height / PX_PER_MM
    doc.addImage(caption.dataUrl, 'PNG', MARGIN_MM, MARGIN_MM, innerW, capH)
    const room = innerH - capH - 4
    const s = Math.min(innerW / pic.width, room / pic.height)
    const w = pic.width * s
    const h = pic.height * s
    doc.addImage(pic.dataUrl, 'PNG', MARGIN_MM + (innerW - w) / 2, MARGIN_MM + capH + 4, w, h)
  }

  // 2. Outline pages: measure every item, break pages between items.
  if (input.outline.length) {
    const pageW = innerW * PX_PER_MM
    const pageH = innerH * PX_PER_MM
    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${pageW}px;background:#fff;color:#121c1b;font-family:'Space Grotesk','IBM Plex Sans Arabic',system-ui,sans-serif`
    host.setAttribute('dir', input.dir)
    document.body.append(host)
    try {
      const items = outlineElements(input.outline, input.labels)
      for (const el of items) host.append(el)
      const pages: HTMLElement[][] = [[]]
      let used = 0
      for (const el of items) {
        const h = el.offsetHeight + 6
        if (used + h > pageH && pages.at(-1)?.length) {
          pages.push([])
          used = 0
        }
        pages.at(-1)?.push(el)
        used += h
      }
      for (const group of pages) {
        const page = document.createElement('div')
        page.style.cssText = `width:${pageW}px;height:${pageH}px;overflow:hidden;background:#fff`
        page.setAttribute('dir', input.dir)
        for (const el of group) page.append(el)
        host.replaceChildren(page)
        const dataUrl = await toPng(page, { pixelRatio: 2, backgroundColor: '#ffffff' })
        newPage()
        doc.addImage(dataUrl, 'PNG', MARGIN_MM, MARGIN_MM, innerW, innerH)
      }
    } finally {
      host.remove()
    }
  }

  // Page numbers and the "made with" line, as real PDF text.
  const total = doc.getNumberOfPages()
  doc.setFontSize(8)
  doc.setTextColor(120)
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.text(`${i} / ${total}`, paper.w - MARGIN_MM, paper.h - 5, { align: 'right' })
    doc.text(input.labels.footer, MARGIN_MM, paper.h - 5)
  }
  return doc.output('blob')
}

/** A line of text rendered by the browser (any script), as a picture for the PDF. */
async function textImage(
  text: string,
  widthPx: number,
  dir: 'ltr' | 'rtl',
  toPng: typeof import('html-to-image').toPng,
) {
  const el = document.createElement('div')
  el.textContent = text
  el.setAttribute('dir', 'auto')
  el.style.cssText = `position:fixed;left:-20000px;top:0;width:${widthPx}px;font:700 16px 'Space Grotesk','IBM Plex Sans Arabic',system-ui,sans-serif;color:#121c1b;background:#fff;text-align:${dir === 'rtl' ? 'right' : 'left'};padding:2px 0`
  document.body.append(el)
  try {
    const height = el.offsetHeight
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      // the clone must not keep the off-screen position
      style: { position: 'static', left: '0' },
    })
    return { dataUrl, height }
  } finally {
    el.remove()
  }
}
