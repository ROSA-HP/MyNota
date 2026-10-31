import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { motionMs } from '@/lib/motion'
import {
  BookOpen,
  LayoutGrid,
  Link2,
  Maximize,
  Minus,
  MousePointer2,
  PanelsTopLeft,
  Plus,
  StickyNote,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { useCanvasUi } from './canvas/canvasUi'
import { anchorBeside } from './canvas/linking'
import { FIT } from './canvas/fit'
import { findRoot } from './canvas/layout'
import { useAddChild } from './canvas/MapCanvas'
import { levelFor, zoomForLevel, type ZoomLevel } from './canvas/zoom'
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

const LEVEL_ICON = { chapters: BookOpen, sections: PanelsTopLeft, blocks: StickyNote } as const

/** Chapters / Sections / Blocks: jumps to a zoom where the map shows that much detail. */
function LevelSwitch() {
  const { t } = useTranslation()
  const book = useWorkspace((s) => s.map?.type === 'book')
  const level = useStore((s) => levelFor(s.transform[2], book))
  const { fitView, zoomTo } = useReactFlow()
  const levels: ZoomLevel[] = book ? ['chapters', 'sections', 'blocks'] : ['sections', 'blocks']
  const go = (l: ZoomLevel) => {
    useCanvasUi.getState().lockView()
    // All chapters: show the whole book. Otherwise keep the centre and change the zoom.
    if (l === 'chapters')
      void fitView({
        ...FIT,
        maxZoom: zoomForLevel(l, book),
        minZoom: 0.15,
        duration: motionMs(350),
      })
    else void zoomTo(zoomForLevel(l, book), { duration: motionMs(350) })
  }
  return (
    <div
      role="group"
      aria-label={t('ws.book.levels')}
      className="flex items-center gap-0.5 rounded-lg bg-paper-sunken p-0.5"
    >
      {levels.map((l) => {
        const Icon = LEVEL_ICON[l]
        const active = l === level
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            title={t(`ws.book.level.${l}`)}
            onClick={() => go(l)}
            className={cn(
              'flex h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold whitespace-nowrap',
              active ? 'border-2 border-line bg-surface text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon size={17} aria-hidden />
            <span className="hidden lg:inline">{t(`ws.book.level.${l}`)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Bottom toolbar: select, add, connect, tidy up, detail level, zoom. */
export function Toolbar() {
  const { t } = useTranslation()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const { connecting, startConnect, cancelConnect, openSearch } = useCanvasUi()
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
    requestAnimationFrame(() => void fitView({ ...FIT, duration: motionMs(300) }))
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
            label={t('ws.link.tool')}
            active={connecting}
            onClick={() => {
              if (connecting) return cancelConnect()
              const ui = useCanvasUi.getState()
              const sel = useWorkspace.getState().selectedId
              const sources = ui.multi.length ? ui.multi : sel ? [sel] : []
              // With a block selected: search for the target. Otherwise: tap two blocks.
              if (sources[0]) openSearch(sources, anchorBeside(sources[0]))
              else startConnect()
            }}
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
      <LevelSwitch />
      <span aria-hidden className="mx-0.5 h-6 w-0.5 bg-line-soft" />
      <ToolButton
        label={t('ws.zoomOut')}
        onClick={() => {
          useCanvasUi.getState().lockView()
          void zoomOut({ duration: motionMs(150) })
        }}
      >
        <Minus size={19} aria-hidden />
      </ToolButton>
      <span className="hidden w-12 text-center font-mono text-xs font-bold sm:inline" dir="ltr">
        {Math.round(zoom * 100)}%
      </span>
      <ToolButton
        label={t('ws.zoomIn')}
        onClick={() => {
          useCanvasUi.getState().lockView()
          void zoomIn({ duration: motionMs(150) })
        }}
      >
        <Plus size={19} aria-hidden />
      </ToolButton>
      <ToolButton
        label={t('ws.fit')}
        onClick={() => void fitView({ ...FIT, duration: motionMs(300) })}
      >
        <Maximize size={18} aria-hidden />
      </ToolButton>
    </div>
  )
}
