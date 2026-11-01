import { useReactFlow } from '@xyflow/react'
import { ArrowLeft, ArrowRight, ChevronRight, Pencil, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, IconButton } from '@/components/ui'
import { BlockCards } from '@/features/study/BlockCards'
import { cn } from '@/lib/cn'
import type { NodeRow, RelationRow } from '@/lib/database.types'
import { motionMs } from '@/lib/motion'
import { DetailList } from '../canvas/DetailList'
import { useCanvasUi } from '../canvas/canvasUi'
import { FIT } from '../canvas/fit'
import { TYPE_ICON, chapterColor, relationColor } from '../canvas/visuals'
import { useWorkspace } from '../workspaceStore'
import { formatRange } from './NodePanel'
import { PagePreview } from './PagePreview'
import { useNodeSource } from './useNodeSource'

/**
 * A block as a study card (canvas step 5): what to learn first, then everything around it.
 * Formulas lead, typeset large; then the summary and the other details; the ideas inside this
 * block and the blocks it is linked to (tap to go there); its flashcards; and, folded away,
 * the source text it came from. Editing is one tap away (Edit).
 */
export function BlockReader({ node, onClose }: { node: NodeRow; onClose: () => void }) {
  const { t } = useTranslation()
  const nodes = useWorkspace((s) => s.nodes)
  const relations = useWorkspace((s) => s.relations)
  const map = useWorkspace((s) => s.map)
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const { fitView } = useReactFlow()
  const { paragraphs, pageSources } = useNodeSource(node)

  // The section this block belongs to gives the card its color.
  let section: NodeRow | undefined = node
  while (section && section.level === 'block')
    section = section.parent_id ? nodes[section.parent_id] : undefined
  const parent = node.parent_id ? nodes[node.parent_id] : undefined
  const color = chapterColor(section?.color)
  const children = Object.values(nodes)
    .filter((n) => n.parent_id === node.id)
    .sort((a, b) => a.sort_order - b.sort_order)
  const links = Object.values(relations).filter(
    (r) => r.status === 'accepted' && (r.from_node === node.id || r.to_node === node.id),
  )
  const formulas = node.details.filter((d) => d.kind === 'formula')
  const rest = node.details.filter((d) => d.kind !== 'formula')
  const Icon = node.type ? TYPE_ICON[node.type] : null

  /** Opens another block: selects it, opens it in place and brings it into view. */
  const go = (id: string) => {
    useWorkspace.getState().select(id)
    useCanvasUi.getState().lockView()
    void fitView({ nodes: [{ id }], ...FIT, maxZoom: 1.1, duration: motionMs(450) })
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center gap-2 border-b-2 border-line px-3.5 py-2.5"
        style={{ background: color.tint }}
      >
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-lg border-[1.5px] border-line bg-surface">
            <Icon size={16} aria-hidden />
          </span>
        )}
        <span className="truncate text-sm font-semibold">
          {node.type ? t(`ws.types.${node.type}`) : t('ws.reader.block')}
        </span>
        {node.importance === 'core' && <Badge tone="brand">{t('ws.core')}</Badge>}
        {node.ai_added && (
          <Sparkles
            size={14}
            role="img"
            aria-label={t('ws.aiAddedBadge')}
            className="text-ink-muted"
          />
        )}
        <span className="ms-auto flex items-center gap-1">
          {canEdit && (
            <Button
              size="sm"
              icon={<Pencil size={14} aria-hidden />}
              onClick={() => useCanvasUi.getState().setPanelOpen(true, 'edit')}
            >
              {t('ws.card.edit')}
            </Button>
          )}
          <IconButton
            label={t('ws.panel.close')}
            bordered={false}
            className="size-9"
            onClick={onClose}
          >
            <X size={18} />
          </IconButton>
        </span>
      </div>

      <article className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <header className="flex flex-col gap-1">
          {(section || parent) && (
            <nav
              aria-label={t('ws.reader.path')}
              className="flex flex-wrap items-center gap-1 text-xs text-ink-muted"
            >
              {section && section.id !== node.id && <span dir="auto">{section.title}</span>}
              {parent && parent.level === 'block' && (
                <>
                  <ChevronRight size={12} aria-hidden className="rtl:-scale-x-100" />
                  <button
                    type="button"
                    className="cursor-pointer underline"
                    dir="auto"
                    onClick={() => go(parent.id)}
                  >
                    {parent.title}
                  </button>
                </>
              )}
            </nav>
          )}
          <h2 className="text-2xl leading-tight font-bold text-balance" dir="auto">
            {node.title}
          </h2>
        </header>

        {formulas.length > 0 && (
          <section
            aria-label={t('ws.reader.formulas')}
            className="rounded-neo border-2 border-line p-2"
          >
            <DetailList details={formulas} />
          </section>
        )}

        {node.summary && (
          <p className="text-base leading-relaxed" dir="auto">
            {node.summary}
          </p>
        )}

        {rest.length > 0 && <DetailList details={rest} />}

        {children.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink-muted">{t('ws.reader.inside')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {children.map((c) => (
                <Chip key={c.id} onClick={() => go(c.id)} color={color.strong}>
                  {c.title}
                </Chip>
              ))}
            </div>
          </section>
        )}

        {links.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-ink-muted">{t('ws.reader.links')}</h3>
            <ul className="flex flex-col gap-1.5">
              {links.map((r) => (
                <LinkRow key={r.id} r={r} self={node.id} nodes={nodes} onGo={go} />
              ))}
            </ul>
          </section>
        )}

        {map && <BlockCards mapId={map.id} nodeId={node.id} canEdit={canEdit} />}

        <details className="group rounded-neo border-2 border-line-soft open:border-line">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold">
            <ChevronRight
              size={14}
              aria-hidden
              className="transition-transform group-open:rotate-90 rtl:-scale-x-100"
            />
            {t('ws.panel.source')}
            {node.source.paragraphs.length > 0 && (
              <span className="font-mono text-xs text-ink-muted" dir="ltr">
                {formatRange(node.source.paragraphs)}
              </span>
            )}
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {node.ai_added && node.ai_added_reason && (
              <Badge tone="warning" className="self-start normal-case">
                {t('ws.panel.addedReason', { reason: node.ai_added_reason })}
              </Badge>
            )}
            {paragraphs.length ? (
              paragraphs.slice(0, 12).map((p) => (
                <p key={p.n} dir="auto" className="text-sm leading-relaxed whitespace-pre-line">
                  <span className="me-1.5 font-mono text-xs font-bold text-ink-muted" dir="ltr">
                    P{p.n}
                  </span>
                  {p.text}
                </p>
              ))
            ) : (
              <p className="text-sm text-ink-muted">{t('ws.panel.noSource')}</p>
            )}
            {pageSources.map(({ src, pages }) => (
              <PagePreview key={src.id} source={src} pages={pages} />
            ))}
          </div>
        </details>
      </article>
    </div>
  )
}

function Chip({
  children,
  onClick,
  color,
}: {
  children: string
  onClick: () => void
  color: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      dir="auto"
      className="max-w-full cursor-pointer truncate rounded-full border-2 bg-surface px-2.5 py-1 text-sm font-semibold hover:bg-surface-muted"
      style={{ borderColor: color }}
    >
      {children}
    </button>
  )
}

/** "→ gives · Limiting Angle (Slit)": the link's meaning (in its color) and the other block. */
function LinkRow({
  r,
  self,
  nodes,
  onGo,
}: {
  r: RelationRow
  self: string
  nodes: Record<string, NodeRow>
  onGo: (id: string) => void
}) {
  const { t } = useTranslation()
  const outgoing = r.from_node === self
  const other = nodes[outgoing ? r.to_node : r.from_node]
  if (!other) return null
  const label = r.label || t(`ws.relations.${r.type}`)
  const Arrow = outgoing ? ArrowRight : ArrowLeft
  return (
    <li>
      <button
        type="button"
        onClick={() => onGo(other.id)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-neo border-2 border-line-soft px-2.5 py-1.5 text-start hover:border-line"
      >
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border-2 px-2 text-xs font-bold',
          )}
          style={{ borderColor: relationColor(r) }}
        >
          <Arrow size={12} aria-hidden className="rtl:-scale-x-100" />
          <span dir="auto">{label}</span>
        </span>
        <span className="min-w-0 truncate text-sm font-semibold" dir="auto">
          {other.title}
        </span>
      </button>
    </li>
  )
}
