import type { PDFDocumentProxy } from 'pdfjs-dist'

export { looksScanned, readOutline, readPageText } from './pdfText'

const BASE = import.meta.env.BASE_URL

/** pdf.js is loaded on demand (it is large) with its worker and data files from our origin. */
async function pdfjs() {
  const [lib, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await pdfjs()
  return lib.getDocument({
    data,
    cMapUrl: `${BASE}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
    wasmUrl: `${BASE}pdfjs/wasm/`,
    iccUrl: `${BASE}pdfjs/iccs/`,
    enableXfa: false,
  }).promise
}

/** Whether a page paints an image (a scanned page is one big image). */
export async function hasImages(doc: PDFDocumentProxy, n: number): Promise<boolean> {
  const lib = await pdfjs()
  const page = await doc.getPage(n)
  const ops = await page.getOperatorList()
  const imageOps = new Set([
    lib.OPS.paintImageXObject,
    lib.OPS.paintInlineImageXObject,
    lib.OPS.paintImageXObjectRepeat,
  ])
  page.cleanup()
  return ops.fnArray.some((op) => imageOps.has(op))
}

/** Renders a page to a canvas (for OCR at scale ~2, for thumbnails at a small width). */
export async function renderPage(
  doc: PDFDocumentProxy,
  n: number,
  opts: { scale?: number; width?: number },
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const scale = opts.width ? opts.width / base.width : (opts.scale ?? 2)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  page.cleanup()
  return canvas
}
