import { useEffect, useRef } from 'react'
import { Link2, Plus, SquarePen, Trash, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog } from '@/components/ui'
import { useCanvasUi } from './canvas/canvasUi'
import { anchorBeside } from './canvas/linking'
import { useAddChild } from './canvas/MapCanvas'
import { useWorkspace } from './workspaceStore'

/** Right-click / long-press menu on a node. */
export function NodeMenu() {
  const { t } = useTranslation()
  const { menu, closeMenu, openSearch, askDelete } = useCanvasUi()
  const node = useWorkspace((s) => (menu ? s.nodes[menu.nodeId] : undefined))
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const select = useWorkspace((s) => s.select)
  const addChild = useAddChild()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, closeMenu])

  if (!menu || !node) return null
  const x = Math.min(menu.x, window.innerWidth - 220)
  const y = Math.min(menu.y, window.innerHeight - 240)
  const item =
    'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-start text-[15px] font-semibold hover:bg-paper-sunken'
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('ws.nodeActions')}
      className="fixed z-50 w-52 origin-top-left animate-pop rounded-neo-lg border-2 border-line bg-surface p-1.5 text-ink neo-shadow [animation-duration:220ms] rtl:origin-top-right"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          select(node.id)
          closeMenu()
        }}
      >
        <SquarePen size={17} aria-hidden /> {t('ws.panel.label')}
      </button>
      {canEdit && (
        <>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              addChild(node.id)
              closeMenu()
            }}
          >
            <Plus size={17} aria-hidden /> {t('ws.addChild')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => openSearch([node.id], anchorBeside(node.id))}
          >
            <Link2 size={17} aria-hidden /> {t('ws.link.linkTo')}
            <kbd className="ms-auto font-mono text-[11px] text-ink-muted">L</kbd>
          </button>
          {node.parent_id && (
            <button
              type="button"
              role="menuitem"
              className={`${item} text-danger`}
              onClick={() => askDelete(node.id)}
            >
              <Trash size={17} aria-hidden /> {t('ws.delete')}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function DeleteConfirm() {
  const { t } = useTranslation()
  const { confirmDelete, askDelete } = useCanvasUi()
  const node = useWorkspace((s) => (confirmDelete ? s.nodes[confirmDelete] : undefined))
  const remove = useWorkspace((s) => s.deleteNode)
  if (!node) return null
  return (
    <Dialog
      open
      onClose={() => askDelete(null)}
      title={t('ws.delete')}
      footer={
        <>
          <Button variant="ghost" onClick={() => askDelete(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              remove(node.id)
              askDelete(null)
            }}
          >
            {t('ws.delete')}
          </Button>
        </>
      }
    >
      <p dir="auto">{t('ws.deleteConfirm', { title: node.title })}</p>
    </Dialog>
  )
}

/** Status line for two-click linking and for several blocks picked with Shift. */
export function ConnectHint() {
  const { t } = useTranslation()
  const connecting = useCanvasUi((s) => s.connecting)
  const connectFrom = useCanvasUi((s) => s.connectFrom)
  const multi = useCanvasUi((s) => s.multi)
  const text = connecting
    ? connectFrom
      ? t('ws.connectHint')
      : t('ws.link.pickFirst')
    : multi.length > 1
      ? t('ws.link.severalPicked', { count: multi.length })
      : null
  if (!text) return null
  return (
    <div
      role="status"
      className="animate-rise rounded-full border-2 border-line bg-brand-soft px-4 py-2 text-sm font-semibold text-ink neo-shadow-sm"
    >
      {text}
    </div>
  )
}

/** Shows which study view is on (focus, hidden details) with a way out; Esc leaves focus. */
export function StudyViewBanner() {
  const { t } = useTranslation()
  const focusId = useCanvasUi((s) => s.focusId)
  const cover = useCanvasUi((s) => s.cover)
  const title = useWorkspace((s) => (focusId ? (s.nodes[focusId]?.title ?? '') : ''))

  useEffect(() => {
    if (!focusId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useCanvasUi.getState().setFocus(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusId])

  if (!focusId && !cover) return null
  return (
    <div className="mynota-stagger flex flex-wrap items-center justify-center gap-2" role="status">
      {focusId && (
        <span className="flex items-center gap-2 rounded-full border-2 border-line bg-surface py-1 ps-4 pe-1 text-sm font-semibold neo-shadow-sm">
          <span dir="auto">{t('ws.studyView.focusOn', { name: title })}</span>
          <span className="hidden font-normal text-ink-muted md:inline">
            {t('ws.studyView.focusHint')}
          </span>
          <button
            type="button"
            aria-label={t('ws.studyView.leaveFocus')}
            onClick={() => useCanvasUi.getState().setFocus(null)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-paper-sunken pointer-coarse:size-11"
          >
            <X size={16} aria-hidden />
          </button>
        </span>
      )}
      {cover && (
        <span className="flex items-center gap-2 rounded-full border-2 border-line bg-surface py-1 ps-4 pe-1 text-sm font-semibold neo-shadow-sm">
          {t('ws.studyView.coverHint')}
          <button
            type="button"
            onClick={() => useCanvasUi.getState().revealAll()}
            className="min-h-8 cursor-pointer rounded-full px-3 text-brand hover:bg-paper-sunken pointer-coarse:min-h-11"
          >
            {t('ws.studyView.showAll')}
          </button>
        </span>
      )}
    </div>
  )
}
