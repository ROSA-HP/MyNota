import { getNodesBounds, type Node, type ReactFlowInstance } from '@xyflow/react'

/** Biggest side of a map picture in CSS pixels (×2 for sharpness stays under canvas limits). */
const MAX_SIDE = 7000
const PADDING = 48

export interface CaptureOptions {
  /** Node ids to fit (a chapter or section and everything in it); null for the whole map. */
  ids: Set<string> | null
  /** Exactly what is on screen now, instead of fitting the map. */
  screen?: boolean
  /** Paler region fills and a white page (saves ink). */
  light: boolean
  /** Draw the links between blocks. */
  links: boolean
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Elements that never belong in a picture of the map. */
function keep(links: boolean) {
  return (el: HTMLElement | SVGElement) => {
    const cl = el.classList
    if (!cl) return true
    if (
      cl.contains('react-flow__minimap') ||
      cl.contains('react-flow__panel') ||
      cl.contains('react-flow__background') ||
      cl.contains('react-flow__handle') ||
      cl.contains('mynota-no-export')
    )
      return false
    // Suggested links are not part of the map yet.
    if (cl.contains('is-suggested')) return false
    if (el instanceof HTMLElement && el.dataset.suggested !== undefined) return false
    if (
      !links &&
      (cl.contains('react-flow__edge-relation') || cl.contains('react-flow__edge-bundle'))
    )
      return false
    if (!links && el instanceof HTMLElement && el.dataset.relationLabel !== undefined) return false
    return true
  }
}

/**
 * Takes a picture of the map as drawn on the canvas (blocks level), in the light theme.
 * The canvas is put back exactly as it was afterwards.
 */
export async function captureMap(
  rf: ReactFlowInstance,
  opts: CaptureOptions,
): Promise<{
  dataUrl: string
  width: number
  height: number
}> {
  const { toPng } = await import('html-to-image')
  const flow = document.querySelector<HTMLElement>('.mynota-flow')
  const viewport = flow?.querySelector<HTMLElement>('.react-flow__viewport')
  if (!flow || !viewport) throw new Error('The map is not on screen.')

  const root = document.documentElement
  const theme = root.dataset.theme
  const before = rf.getViewport()
  root.dataset.theme = 'light'
  flow.classList.add('is-exporting')
  if (opts.light) flow.classList.add('export-light')
  try {
    if (opts.screen) {
      await nextFrame()
      const r = flow.getBoundingClientRect()
      const dataUrl = await toPng(flow, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: keep(opts.links),
      })
      return { dataUrl, width: r.width, height: r.height }
    }
    // Blocks level everywhere (zoomed-out levels draw cards instead of blocks).
    await rf.setViewport({ x: before.x, y: before.y, zoom: 1 })
    await nextFrame()
    await nextFrame()
    await wait(120)
    const nodes = rf
      .getNodes()
      .filter((n: Node) =>
        opts.ids ? opts.ids.has(n.id) || opts.ids.has(n.id.replace(/^region:/, '')) : true,
      )
    if (!nodes.length) throw new Error('Nothing to export.')
    const b = getNodesBounds(nodes)
    const w = b.width + PADDING * 2
    const h = b.height + PADDING * 2
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const width = Math.round(w * scale)
    const height = Math.round(h * scale)
    const dataUrl = await toPng(viewport, {
      width,
      height,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: keep(opts.links),
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${(PADDING - b.x) * scale}px, ${(PADDING - b.y) * scale}px) scale(${scale})`,
      },
    })
    return { dataUrl, width, height }
  } finally {
    flow.classList.remove('is-exporting', 'export-light')
    if (theme) root.dataset.theme = theme
    else delete root.dataset.theme
    await rf.setViewport(before)
  }
}

/** Saves a file through the browser (nothing leaves the device). */
export function download(name: string, data: Blob | string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  // Outside an open modal dialog the page is inert, and an inert link loses its file name.
  ;(document.querySelector('dialog[open]') ?? document.body).append(a)
  a.click()
  a.remove()
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A file name from a title: keeps letters of any script, drops characters files cannot have. */
export function fileName(title: string, ext: string): string {
  const base = [...title]
    .map((ch) => ((ch.codePointAt(0) ?? 0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'MyNota'}.${ext}`
}
