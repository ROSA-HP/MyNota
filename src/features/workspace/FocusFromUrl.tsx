import { useReactFlow } from '@xyflow/react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { motionMs } from '@/lib/motion'
import { useCanvasUi } from './canvas/canvasUi'
import { useWorkspace } from './workspaceStore'

/**
 * Opens the map on one block when the address says `?node=<id>` ("Show on map" from a card):
 * selects it and centers the canvas on it once it has been drawn.
 */
export function FocusFromUrl() {
  const [params, setParams] = useSearchParams()
  const target = params.get('node')
  const ready = useWorkspace((s) => s.status === 'ready')
  const exists = useWorkspace((s) => (target ? Boolean(s.nodes[target]) : false))
  const { getInternalNode, setCenter } = useReactFlow()

  useEffect(() => {
    if (!target || !ready || !exists) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const internal = getInternalNode(target)
      const width = internal?.measured.width
      if (internal && width) {
        useCanvasUi.getState().lockView()
        useWorkspace.getState().select(target)
        const { x, y } = internal.internals.positionAbsolute
        void setCenter(x + width / 2, y + (internal.measured.height ?? 0) / 2, {
          zoom: 1,
          duration: motionMs(450),
        })
        const next = new URLSearchParams(params)
        next.delete('node')
        setParams(next, { replace: true })
        return
      }
      if (++tries < 40) timer = setTimeout(tick, 100)
    }
    // After the first fit of the whole map, so that fit does not move the camera away again.
    timer = setTimeout(tick, 300)
    return () => clearTimeout(timer)
  }, [target, ready, exists, getInternalNode, setCenter, params, setParams])

  return null
}
