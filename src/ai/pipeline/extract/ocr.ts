import type { Worker as TesseractWorker } from 'tesseract.js'
import type { Line } from './types'

/** Tesseract language codes for the OCR language choice. */
export type OcrLanguage = 'en' | 'de' | 'ar' | 'mixed'
const LANGS: Record<OcrLanguage, string[]> = {
  en: ['eng'],
  de: ['deu', 'eng'],
  ar: ['ara', 'eng'],
  mixed: ['eng', 'deu', 'ara'],
}

const BASE = import.meta.env.BASE_URL

let current: { key: string; worker: Promise<TesseractWorker> } | null = null

/**
 * One OCR worker per language set, created on first use. Engine, worker and language data come
 * from our own origin (see vite.config.ts) and run entirely in this browser.
 */
async function getWorker(lang: OcrLanguage): Promise<TesseractWorker> {
  const langs = LANGS[lang]
  const key = langs.join('+')
  if (current?.key === key) return current.worker
  if (current) void current.worker.then((w) => w.terminate()).catch(() => undefined)
  const worker = import('tesseract.js').then(({ createWorker, OEM }) =>
    createWorker(langs, OEM.LSTM_ONLY, {
      workerPath: `${BASE}ocr/worker.min.js`,
      corePath: `${BASE}ocr/core/`,
      langPath: `${BASE}ocr/lang`,
      workerBlobURL: false,
      gzip: true,
    }),
  )
  current = { key, worker }
  return worker
}

export async function stopOcr(): Promise<void> {
  const c = current
  current = null
  if (c) await c.worker.then((w) => w.terminate()).catch(() => undefined)
}

interface OcrLine {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

/** Reads the text lines of one page image. Sizes are in image pixels. */
export async function ocrImage(
  image: HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
  lang: OcrLanguage,
): Promise<{ lines: Line[]; height: number }> {
  const worker = await getWorker(lang)
  const { data } = await worker.recognize(
    image as HTMLCanvasElement,
    {},
    { blocks: true, text: false },
  )
  const lines: Line[] = []
  for (const block of data.blocks ?? [])
    for (const para of block.paragraphs)
      for (const l of para.lines as OcrLine[]) {
        const text = l.text.replace(/\s+/g, ' ').trim()
        if (!text) continue
        const h = l.bbox.y1 - l.bbox.y0
        // A text line's box is about 1.25× its font size (ascenders + descenders).
        lines.push({
          text,
          size: h / 1.25,
          top: l.bbox.y0,
          left: l.bbox.x0,
          width: l.bbox.x1 - l.bbox.x0,
        })
      }
  lines.sort((a, b) => a.top - b.top || a.left - b.left)
  return { lines, height: image.height }
}

/** Decodes a photo (honouring its orientation) and scales it so the long side is ≤ 2400 px. */
export async function photoToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}
