import { getNodesBounds, type Node, type ReactFlowInstance } from '@xyflow/react'
import { useCanvasUi } from '@/features/workspace/canvas/canvasUi'

/** Biggest side of a map picture in CSS pixels (×2 for sharpness stays under canvas limits). */
const MAX_SIDE = 7000
const PADDING_X = 72
const PADDING_Y = 64

export interface CaptureOptions {
  /** Node ids to fit (a chapter or section and everything in it); null for the whole map. */
  ids: Set<string> | null
  /** Exactly what is on screen now, instead of fitting the map. */
  screen?: boolean
  /** Paler region fills and a white page (saves ink). */
  light: boolean
  /** Draw the links between blocks. */
  links: boolean
  /** Force a landscape/horizontal arrangement so the captured mind map fills landscape PDF pages. */
  horizontal?: boolean
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Elements that never belong in a picture of the map. */
export function keep(
  links: boolean,
  scopeIds?: Set<string> | null,
  excludedEdgeIds?: Set<string>,
) {
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
    if (el.getAttribute('data-suggested') !== null) return false
    if (
      !links &&
      (cl.contains('react-flow__edge-relation') || cl.contains('react-flow__edge-bundle'))
    )
      return false
    if (!links && el.getAttribute('data-relation-label') !== null) return false

    if (scopeIds) {
      if (cl.contains('react-flow__node')) {
        const id = el.getAttribute('data-id')
        if (id && !scopeIds.has(id) && !scopeIds.has(id.replace(/^region:/, ''))) return false
      }
      if (cl.contains('react-flow__edge') && excludedEdgeIds) {
        const edgeId = el.getAttribute('data-id')
        if (edgeId && excludedEdgeIds.has(edgeId)) return false
      }
      const src = el.getAttribute('data-source')
      const tgt = el.getAttribute('data-target')
      if ((src && !scopeIds.has(src)) || (tgt && !scopeIds.has(tgt))) return false
    }

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

  const scopeIds = opts.ids
  const excludedEdgeIds = scopeIds
    ? new Set(
        rf
          .getEdges()
          .filter((e) => !scopeIds.has(e.source) || !scopeIds.has(e.target))
          .map((e) => e.id),
      )
    : undefined

  const scopedNodes = () =>
    rf
      .getNodes()
      .filter((n: Node) =>
        opts.ids ? opts.ids.has(n.id) || opts.ids.has(n.id.replace(/^region:/, '')) : true,
      )

  const root = document.documentElement
  const theme = root.dataset.theme
  const before = rf.getViewport()
  const canvasUi = useCanvasUi.getState()
  const prevExportLayout = canvasUi.exportLayout
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
        filter: keep(opts.links, opts.ids, excludedEdgeIds),
      })
      return { dataUrl, width: r.width, height: r.height }
    }
    // Blocks level everywhere (zoomed-out levels draw cards instead of blocks).
    await rf.setViewport({ x: before.x, y: before.y, zoom: 1 })
    if (opts.horizontal) {
      canvasUi.setExportLayout({ horizontal: true, pageRatio: 1.85, useSavedPositions: true })
      await nextFrame()
      await nextFrame()
      await wait(80)
      const firstNodes = scopedNodes()
      if (firstNodes.length) {
        const firstBounds = getNodesBounds(firstNodes)
        if (firstBounds.width / Math.max(1, firstBounds.height) < 1.35) {
          canvasUi.setExportLayout({ horizontal: true, pageRatio: 1.85, useSavedPositions: false })
          await nextFrame()
          await nextFrame()
          await wait(120)
        }
      }
    } else {
      await nextFrame()
      await nextFrame()
      await wait(120)
    }
    const nodes = scopedNodes()
    if (!nodes.length) throw new Error('Nothing to export.')
    const b = getNodesBounds(nodes)
    // Allow clearance for outer Bus spines, neo-brutalist card shadows, and curved relation arcs.
    const edgeExtra = opts.links ? 32 : 0
    const padX = PADDING_X + edgeExtra
    const padY = PADDING_Y + edgeExtra
    const w = b.width + padX * 2
    const h = b.height + padY * 2
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const width = Math.round(w * scale)
    const height = Math.round(h * scale)
    const dataUrl = await toPng(viewport, {
      width,
      height,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      filter: keep(opts.links, opts.ids, excludedEdgeIds),
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transformOrigin: '0 0',
        transform: `translate(${(padX - b.x) * scale}px, ${(padY - b.y) * scale}px) scale(${scale})`,
      },
    })
    return { dataUrl, width, height }
  } finally {
    canvasUi.setExportLayout(prevExportLayout)
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
