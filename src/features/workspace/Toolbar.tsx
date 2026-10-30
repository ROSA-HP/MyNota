import { useReactFlow, useViewport } from '@xyflow/react'
import { LayoutGrid, Link2, Maximize, Minus, MousePointer2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { useCanvasUi } from './canvas/canvasUi'
import { FIT } from './canvas/fit'
import { findRoot } from './canvas/layout'
import { useAddChild } from './canvas/MapCanvas'
import { useWorkspace } from './workspaceStore'

function ToolButton({
  label,
  active,
  onClick,
  children,
  showLabel,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  showLabel?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={showLabel ? undefined : label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold whitespace-nowrap',
        active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-sunken',
      )}
    >
      {children}
      {showLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}

/** Bottom toolbar: select, add, connect, tidy up, zoom. */
export function Toolbar() {
  const { t } = useTranslation()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const { connecting, startConnect, cancelConnect } = useCanvasUi()
  const addChild = useAddChild()

  const add = () => {
    const ws = useWorkspace.getState()
    const target = ws.selectedId ?? findRoot(Object.values(ws.nodes))?.id
    if (target) addChild(target)
  }

  const tidy = () => {
    const ws = useWorkspace.getState()
    ws.updateNodes(
      Object.values(ws.nodes)
        .filter((n) => n.position)
        .map((n) => ({ id: n.id, patch: { position: null } })),
    )
    requestAnimationFrame(() => void fitView({ ...FIT, duration: 300 }))
  }

  return (
    <div
      role="toolbar"
      aria-label={t('ws.tools')}
      className="flex items-center gap-1 rounded-neo-lg border-2 border-line bg-surface p-1 neo-shadow"
    >
      <ToolButton label={t('ws.select')} active={!connecting} onClick={cancelConnect}>
        <MousePointer2 size={19} aria-hidden className="rtl:-scale-x-100" />
      </ToolButton>
      {canEdit && (
        <>
          <ToolButton label={t('ws.add')} onClick={add} showLabel>
            <Plus size={19} aria-hidden />
          </ToolButton>
          <ToolButton
            label={t('ws.connect')}
            active={connecting}
            onClick={() =>
              connecting ? cancelConnect() : startConnect(useWorkspace.getState().selectedId)
            }
            showLabel
          >
            <Link2 size={19} aria-hidden />
          </ToolButton>
          <span aria-hidden className="mx-0.5 h-6 w-0.5 bg-line-soft" />
          <ToolButton label={t('ws.tidy')} onClick={tidy} showLabel>
            <LayoutGrid size={19} aria-hidden />
          </ToolButton>
        </>
      )}
      <span aria-hidden className="mx-0.5 h-6 w-0.5 bg-line-soft" />
      <ToolButton label={t('ws.zoomOut')} onClick={() => void zoomOut({ duration: 150 })}>
        <Minus size={19} aria-hidden />
      </ToolButton>
      <span className="hidden w-12 text-center font-mono text-xs font-bold sm:inline" dir="ltr">
        {Math.round(zoom * 100)}%
      </span>
      <ToolButton label={t('ws.zoomIn')} onClick={() => void zoomIn({ duration: 150 })}>
        <Plus size={19} aria-hidden />
      </ToolButton>
      <ToolButton label={t('ws.fit')} onClick={() => void fitView({ ...FIT, duration: 300 })}>
        <Maximize size={18} aria-hidden />
      </ToolButton>
    </div>
  )
}
