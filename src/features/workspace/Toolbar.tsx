import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { motionMs } from '@/lib/motion'
import {
  BookOpen,
  CircleDot,
  EyeOff,
  Focus,
  LayoutGrid,
  Link2,
  Maximize,
  Minus,
  MousePointer2,
  PanelsTopLeft,
  Plus,
  Redo2,
  StickyNote,
  Undo2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/components/ui'
import { useDeck } from '@/features/study/deckStore'
import { cn } from '@/lib/cn'
import { useCanvasUi } from './canvas/canvasUi'
import { anchorBeside } from './canvas/linking'
import { FIT } from './canvas/fit'
import { focusGroupOf } from './canvas/focus'
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
  disabled,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  showLabel?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={showLabel ? undefined : label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold whitespace-nowrap transition-[background-color,color,scale] duration-150 active:scale-90 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent',
        // The icon pops when a tool is switched on.
        '[&[aria-pressed=true]>svg]:animate-pop',
        active ? 'bg-selected text-selected-ink' : 'text-ink hover:bg-paper-sunken',
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
              'flex h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150 [&[aria-pressed=true]>svg]:animate-pop',
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

/** Study views: mastery dots, hide details (recall), focus on one section or chapter. */
function StudyViews() {
  const { t } = useTranslation()
  const { fitView } = useReactFlow()
  const showMastery = useCanvasUi((s) => s.showMastery)
  const cover = useCanvasUi((s) => s.cover)
  const focusId = useCanvasUi((s) => s.focusId)
  const hasCards = useDeck((s) => s.status === 'ready' && Object.keys(s.cards).length > 0)

  const focus = () => {
    const ui = useCanvasUi.getState()
    if (ui.focusId) return ui.setFocus(null)
    const ws = useWorkspace.getState()
    const group = ws.selectedId ? focusGroupOf(ws.nodes, ws.selectedId) : null
    if (!group) return toast(t('ws.studyView.pickFocus'))
    ui.setFocus(group)
    ui.lockView()
    void fitView({
      nodes: [{ id: `region:${group}` }, { id: group }],
      ...FIT,
      duration: motionMs(400),
    })
  }

  return (
    <>
      {hasCards && (
        <ToolButton
          label={t('ws.studyView.mastery')}
          active={showMastery}
          onClick={() => useCanvasUi.getState().setShowMastery(!showMastery)}
        >
          <CircleDot size={19} aria-hidden />
        </ToolButton>
      )}
      <ToolButton
        label={t('ws.studyView.hide')}
        active={cover}
        onClick={() => useCanvasUi.getState().setCover(!cover)}
      >
        <EyeOff size={19} aria-hidden />
      </ToolButton>
      <ToolButton label={t('ws.studyView.focus')} active={focusId !== null} onClick={focus}>
        <Focus size={19} aria-hidden />
      </ToolButton>
    </>
  )
}

/** Bottom toolbar: select, add, connect, tidy up, detail level, study views, zoom. */
export function Toolbar() {
  const { t } = useTranslation()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const canUndo = useWorkspace((s) => s.canUndo)
  const canRedo = useWorkspace((s) => s.canRedo)
  // With the details panel open the canvas is narrower: icons only.
  const compact = useWorkspace((s) => s.selectedId !== null || s.selectedRelationId !== null)
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
      className="flex max-w-full animate-rise items-center gap-1 overflow-x-auto rounded-neo-lg border-2 border-line bg-surface p-1 neo-shadow [animation-delay:150ms] [scrollbar-width:thin]"
    >
      <ToolButton label={t('ws.select')} active={!connecting} onClick={cancelConnect}>
        <MousePointer2 size={19} aria-hidden className="rtl:-scale-x-100" />
      </ToolButton>
      {canEdit && (
        <>
          <ToolButton label={t('ws.add')} onClick={add} showLabel={!compact}>
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
            showLabel={!compact}
          >
            <Link2 size={19} aria-hidden />
          </ToolButton>
          <span aria-hidden className="mx-0.5 h-6 w-0.5 bg-line-soft" />
          <ToolButton label={t('ws.tidy')} onClick={tidy} showLabel={!compact}>
            <LayoutGrid size={19} aria-hidden />
          </ToolButton>
          <ToolButton
            label={t('ws.undo')}
            onClick={() => useWorkspace.getState().undo()}
            disabled={!canUndo}
          >
            <Undo2 size={19} aria-hidden className="rtl:-scale-x-100" />
          </ToolButton>
          <ToolButton
            label={t('ws.redo')}
            onClick={() => useWorkspace.getState().redo()}
            disabled={!canRedo}
          >
            <Redo2 size={19} aria-hidden className="rtl:-scale-x-100" />
          </ToolButton>
        </>
      )}
      <span aria-hidden className="mx-0.5 h-6 w-0.5 bg-line-soft" />
      <LevelSwitch />
      <span aria-hidden className="mx-0.5 h-6 w-0.5 bg-line-soft" />
      <StudyViews />
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
