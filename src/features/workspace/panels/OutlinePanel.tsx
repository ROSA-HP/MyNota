import { useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import type { NodeRow } from '@/lib/database.types'
import { childrenIndex, findRoot } from '../canvas/layout'
import { chapterColor } from '../canvas/visuals'
import { useWorkspace } from '../workspaceStore'

/** Whole map as a tree; click flies to the node. The filter matches titles and summaries. */
export function OutlinePanel({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const nodes = useWorkspace((s) => s.nodes)
  const selectedId = useWorkspace((s) => s.selectedId)
  const select = useWorkspace((s) => s.select)
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const update = useWorkspace((s) => s.updateNode)
  const { setCenter, getInternalNode } = useReactFlow()
  const [filter, setFilter] = useState('')
  const list = useMemo(() => Object.values(nodes), [nodes])
  const kids = useMemo(() => childrenIndex(list), [list])
  const root = useMemo(() => findRoot(list), [list])
  const q = filter.trim().toLocaleLowerCase()

  const matches = (n: NodeRow): boolean =>
    !q ||
    n.title.toLocaleLowerCase().includes(q) ||
    n.summary.toLocaleLowerCase().includes(q) ||
    (kids.get(n.id) ?? []).some(matches)

  const go = (n: NodeRow) => {
    select(n.id)
    const internal = getInternalNode(n.id)
    if (internal) {
      const { x, y } = internal.internals.positionAbsolute
      void setCenter(
        x + (internal.measured.width ?? 0) / 2,
        y + (internal.measured.height ?? 0) / 2,
        { zoom: 1, duration: 350 },
      )
    }
    onNavigate?.()
  }

  const renderNode = (n: NodeRow, depth: number, color: NodeRow['color']): React.ReactNode => {
    if (!matches(n)) return null
    const children = kids.get(n.id) ?? []
    const open = q ? true : !n.collapsed
    return (
      <li key={n.id}>
        <div
          className={cn(
            'flex items-center gap-1 rounded-lg',
            n.id === selectedId && 'bg-surface neo-shadow-sm outline-2 outline-line',
          )}
          style={{ paddingInlineStart: depth * 14 }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={n.title}
              aria-expanded={open}
              disabled={!canEdit && !q}
              onClick={() => canEdit && update(n.id, { collapsed: !n.collapsed })}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-paper-sunken"
            >
              {open ? (
                <ChevronDown size={15} aria-hidden />
              ) : (
                <ChevronRight size={15} aria-hidden className="rtl:-scale-x-100" />
              )}
            </button>
          ) : (
            <span className="size-7 shrink-0" />
          )}
          {depth === 1 && (
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px] border-[1.5px] border-line"
              style={{ background: chapterColor(color).strong }}
            />
          )}
          <button
            type="button"
            onClick={() => go(n)}
            dir="auto"
            className={cn(
              'min-h-9 min-w-0 flex-1 cursor-pointer truncate rounded-md px-1.5 text-start text-sm',
              depth === 0
                ? 'font-bold'
                : depth === 1
                  ? 'font-semibold'
                  : n.importance === 'extra'
                    ? 'text-ink-muted'
                    : '',
            )}
          >
            {n.title}
          </button>
          {depth === 1 && children.length > 0 && (
            <span className="pe-1.5 font-mono text-[11px] font-bold text-ink-muted">
              {children.length}
            </span>
          )}
        </div>
        {open && children.length > 0 && (
          <ul>{children.map((c) => renderNode(c, depth + 1, depth === 0 ? c.color : color))}</ul>
        )}
      </li>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold">{t('ws.outline')}</h2>
        <span className="font-mono text-[11px] font-bold text-ink-muted">
          {t('ws.nodes', { count: list.length })}
        </span>
      </div>
      <label className="flex min-h-10 items-center gap-2 rounded-neo border-2 border-line bg-surface px-2.5">
        <Search size={15} aria-hidden className="text-ink-muted" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('ws.filter')}
          aria-label={t('ws.filter')}
          dir="auto"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      <ul className="-mx-1 flex-1 overflow-y-auto px-1">{root && renderNode(root, 0, null)}</ul>
    </div>
  )
}
