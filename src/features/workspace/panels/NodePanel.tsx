import { useNodeSource } from './useNodeSource'
import { BlockReader } from './BlockReader'
import { MathFormula } from '@/components/ui/MathFormula'
import { Plus, Trash, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BlockCards } from '@/features/study/BlockCards'
import { NODE_TYPES, RELATION_TYPES } from '@/ai/schemas/common'
import { Badge, Button, IconButton, SelectField, TextField } from '@/components/ui'
import { cn } from '@/lib/cn'
import type {
  DetailBlock,
  Importance,
  NodeRow,
  NodeType,
  RelationRow,
  RelationType,
} from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useCanvasUi } from '../canvas/canvasUi'
import { TYPE_ICON } from '../canvas/visuals'
import { PagePreview } from './PagePreview'
import { useWorkspace } from '../workspaceStore'

const IMPORTANCE: Importance[] = ['core', 'supporting', 'extra']

function DetailRow({
  d,
  onChange,
  onRemove,
  readOnly,
}: {
  d: DetailBlock
  onChange: (d: DetailBlock) => void
  onRemove: () => void
  readOnly: boolean
}) {
  const { t } = useTranslation()
  const remove = !readOnly && (
    <IconButton
      label={t('ws.panel.removeDetail')}
      bordered={false}
      onClick={onRemove}
      className="size-9"
    >
      <X size={16} />
    </IconButton>
  )
  const input =
    'min-h-9 w-full rounded-md border-2 border-line-soft bg-transparent px-2 text-sm focus:border-line focus:outline-none'
  switch (d.kind) {
    case 'text':
    case 'bullet':
    case 'cloze':
      return (
        <li className="flex items-start gap-1">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink" />
          <textarea
            dir="auto"
            rows={1}
            readOnly={readOnly}
            value={d.text}
            placeholder={t('ws.panel.detailPlaceholder')}
            onChange={(e) => onChange({ ...d, text: e.target.value })}
            className={cn(input, 'field-sizing-content resize-none py-1.5')}
          />
          {remove}
        </li>
      )
    case 'example':
      return (
        <li className="flex items-start gap-1 rounded-neo bg-surface-muted p-2 text-sm">
          <span className="min-w-0 flex-1" dir="auto">
            <span className="italic">{d.text}</span>
            {d.translation && <span className="block text-ink-muted">{d.translation}</span>}
          </span>
          {remove}
        </li>
      )
    case 'vocab':
      return (
        <li className="flex items-start gap-1 rounded-neo bg-surface-muted p-2 text-sm">
          <span className="min-w-0 flex-1" dir="auto">
            <strong>
              {d.article ? `${d.article} ` : ''}
              {d.term}
            </strong>
            {d.plural && <span className="text-ink-muted"> ({d.plural})</span>}
            {d.meaning && <span className="block">{d.meaning}</span>}
          </span>
          {remove}
        </li>
      )
    case 'formula':
      return (
        <li className="flex items-start gap-1 rounded-neo bg-surface-muted p-2 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block overflow-x-auto py-1 text-[15px]">
              <MathFormula latex={d.latex} display />
            </span>
            {d.variables && (
              <span className="block text-ink-muted" dir="auto">
                {d.variables}
              </span>
            )}
          </span>
          {remove}
        </li>
      )
    case 'question':
      return (
        <li className="flex items-start gap-1 rounded-neo border-2 border-dashed border-line-soft p-2 text-sm">
          <span className="min-w-0 flex-1" dir="auto">
            <span className="block text-xs font-bold text-ink-muted">{t('ws.panel.question')}</span>
            {d.front}
            <span className="mt-1 block text-xs font-bold text-ink-muted">
              {t('ws.panel.answer')}
            </span>
            {d.back}
          </span>
          {remove}
        </li>
      )
  }
}

function RelationRowView({ r, self, canEdit }: { r: RelationRow; self: string; canEdit: boolean }) {
  const { t } = useTranslation()
  const nodes = useWorkspace((s) => s.nodes)
  const remove = useWorkspace((s) => s.deleteRelation)
  const selectRelation = useWorkspace((s) => s.selectRelation)
  const otherId = r.from_node === self ? r.to_node : r.from_node
  const other = nodes[otherId]
  const label = r.label || t(`ws.relations.${r.type}`)
  return (
    <li className="flex items-center gap-2 rounded-neo border-2 border-line bg-surface-muted px-2.5 py-1.5 text-sm">
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-1.5 text-start"
        onClick={() => selectRelation(r.id)}
      >
        {r.from_node === self ? (
          <span className="inline-block text-ink-muted rtl:-scale-x-100">→</span>
        ) : null}
        <span dir="auto" className="font-semibold">
          {other?.title}
        </span>
        <span
          className={cn(
            'rounded-full border-[1.5px] px-1.5 text-xs font-bold',
            r.status === 'suggested'
              ? 'border-dashed border-ink-muted text-ink-muted'
              : 'border-brand',
          )}
        >
          {label}
        </span>
        {r.to_node === self ? (
          <span className="inline-block text-ink-muted rtl:-scale-x-100">→</span>
        ) : null}
      </button>
      {canEdit && (
        <IconButton
          label={t('ws.panel.removeLink')}
          bordered={false}
          className="size-8"
          onClick={() => remove(r.id)}
        >
          <X size={15} />
        </IconButton>
      )}
    </li>
  )
}

/** Edits one node. Changes save automatically (debounced) through the workspace store. */
export function NodePanel({ node, onClose }: { node: NodeRow; onClose: () => void }) {
  const { t } = useTranslation()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const update = useWorkspace((s) => s.updateNode)
  const relations = useWorkspace((s) => s.relations)
  const map = useWorkspace((s) => s.map)
  const askDelete = useCanvasUi((s) => s.askDelete)
  const isRoot = node.parent_id === null
  const isBlock = node.level === 'block'
  const links = Object.values(relations).filter(
    (r) => r.status !== 'dismissed' && (r.from_node === node.id || r.to_node === node.id),
  )
  const { paragraphs, pageSources } = useNodeSource(node)
  const Icon = node.type ? TYPE_ICON[node.type] : null

  const setDetails = (details: DetailBlock[]) => update(node.id, { details })
  const mode = useCanvasUi((s) => s.panelMode)

  // Blocks open as a study card; this form is their edit mode (canvas step 5).
  if (isBlock && mode === 'read') return <BlockReader node={node} onClose={onClose} />

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b-2 border-line px-3.5 py-2.5">
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-lg border-[1.5px] border-line bg-paper-sunken">
            <Icon size={16} aria-hidden />
          </span>
        )}
        <span className="truncate text-sm font-semibold text-ink-muted">
          {node.type
            ? t(`ws.types.${node.type}`)
            : node.level === 'section'
              ? t(`ws.shapes.${node.branch_view}`)
              : map
                ? t(`library.types.${map.type}`)
                : ''}
        </span>
        {isBlock && (
          <Button
            size="sm"
            variant="secondary"
            className="ms-auto"
            onClick={() => useCanvasUi.getState().setPanelOpen(true, 'read')}
          >
            {t('ws.reader.done')}
          </Button>
        )}
        <IconButton
          label={t('ws.panel.close')}
          bordered={false}
          className={cn('size-9', !isBlock && 'ms-auto')}
          onClick={onClose}
        >
          <X size={18} />
        </IconButton>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3.5">
        <TextField
          key={`title-${node.id}`}
          label={t('ws.panel.title')}
          dir="auto"
          readOnly={!canEdit}
          value={node.title}
          maxLength={200}
          onChange={(e) => update(node.id, { title: e.target.value })}
          onBlur={(e) => {
            const title = e.target.value.trim() || t('ws.newBlock')
            if (title !== node.title) update(node.id, { title })
            // The map title follows its top node.
            if (isRoot && map && title !== map.title)
              void supabase.from('maps').update({ title }).eq('id', map.id)
          }}
          className="[&_input]:text-base [&_input]:font-bold"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`sum-${node.id}`} className="text-sm font-semibold">
            {t('ws.panel.summary')}
          </label>
          <textarea
            id={`sum-${node.id}`}
            dir="auto"
            rows={2}
            maxLength={500}
            readOnly={!canEdit}
            value={node.summary}
            onChange={(e) => update(node.id, { summary: e.target.value })}
            className="field-sizing-content min-h-16 resize-none rounded-neo border-2 border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:neo-shadow-sm"
          />
        </div>

        {isBlock && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t('ws.panel.type')}
              value={node.type ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                update(node.id, { type: (e.target.value || null) as NodeType | null })
              }
              options={[
                { value: '', label: t('ws.panel.noType') },
                ...NODE_TYPES.map((v) => ({ value: v, label: t(`ws.types.${v}`) })),
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{t('ws.panel.importance')}</span>
              <div
                role="radiogroup"
                aria-label={t('ws.panel.importance')}
                className="flex min-h-11 rounded-neo border-2 border-line p-0.5"
              >
                {IMPORTANCE.map((imp) => (
                  <button
                    key={imp}
                    type="button"
                    role="radio"
                    aria-checked={node.importance === imp}
                    disabled={!canEdit}
                    onClick={() => update(node.id, { importance: imp })}
                    className={cn(
                      'flex-1 cursor-pointer rounded-[7px] px-1 text-xs font-semibold disabled:cursor-default',
                      node.importance === imp
                        ? 'bg-selected text-selected-ink'
                        : 'hover:bg-paper-sunken',
                    )}
                  >
                    {imp === 'supporting' ? t('ws.panel.supporting') : t(`ws.${imp}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t('ws.panel.details')}</span>
          {node.details.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-neo border-2 border-line p-2">
              {node.details.map((d, i) => (
                <DetailRow
                  key={i}
                  d={d}
                  readOnly={!canEdit}
                  onChange={(nd) => setDetails(node.details.map((x, j) => (j === i ? nd : x)))}
                  onRemove={() => setDetails(node.details.filter((_, j) => j !== i))}
                />
              ))}
            </ul>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-brand-hover"
              icon={<Plus size={16} aria-hidden />}
              onClick={() => setDetails([...node.details, { kind: 'bullet', text: '' }])}
            >
              {t('ws.panel.addDetail')}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t('ws.panel.links')}</span>
          {links.length ? (
            <ul className="flex flex-col gap-1.5">
              {links.map((r) => (
                <RelationRowView key={r.id} r={r} self={node.id} canEdit={canEdit} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t('ws.panel.noLinks')}</p>
          )}
        </div>

        {isBlock && map && <BlockCards mapId={map.id} nodeId={node.id} canEdit={canEdit} />}

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {t('ws.panel.source')}
            {node.source.paragraphs.length > 0 && (
              <span className="font-mono text-xs" dir="ltr">
                {formatRange(node.source.paragraphs)}
              </span>
            )}
          </span>
          {node.ai_added && node.ai_added_reason && (
            <Badge tone="warning" className="self-start normal-case">
              {t('ws.panel.addedReason', { reason: node.ai_added_reason })}
            </Badge>
          )}
          {paragraphs.length ? (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-neo border-2 border-line bg-[color-mix(in_srgb,var(--ch-yellow)_var(--wash-strong),transparent)] p-3 text-sm leading-relaxed">
              {paragraphs.slice(0, 12).map((p) => (
                <p key={p.n} dir="auto" className="whitespace-pre-line">
                  <span className="me-1.5 font-mono text-xs font-bold text-ink-muted" dir="ltr">
                    P{p.n}
                  </span>
                  {p.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t('ws.panel.noSource')}</p>
          )}
          {pageSources.map(({ src, pages }) => (
            <PagePreview key={src.id} source={src} pages={pages} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t-2 border-line px-3.5 py-2.5">
        <span className="text-xs text-ink-faint">
          {node.origin === 'ai' ? t('ws.panel.writtenByAi') : t('ws.panel.writtenByYou')}
        </span>
        {canEdit && !isRoot && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Trash size={15} aria-hidden />}
            className="bg-danger-soft"
            onClick={() => askDelete(node.id)}
          >
            {t('ws.delete')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** P3, P4, P5, P9 → "P3–P5, P9" */
export function formatRange(ns: number[]): string {
  const sorted = [...new Set(ns)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i] as number
    let end = start
    while (sorted[i + 1] === end + 1) end = sorted[++i] as number
    parts.push(start === end ? `P${start}` : `P${start}–P${end}`)
  }
  return parts.join(', ')
}

/** Edits a selected link: type, label, delete. */
export function RelationPanel({
  relation,
  onClose,
}: {
  relation: RelationRow
  onClose: () => void
}) {
  const { t } = useTranslation()
  const nodes = useWorkspace((s) => s.nodes)
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const update = useWorkspace((s) => s.updateRelation)
  const remove = useWorkspace((s) => s.deleteRelation)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b-2 border-line px-3.5 py-2.5">
        <span className="text-sm font-semibold text-ink-muted">{t('ws.panel.links')}</span>
        <IconButton
          label={t('ws.panel.close')}
          bordered={false}
          className="ms-auto size-9"
          onClick={onClose}
        >
          <X size={18} />
        </IconButton>
      </div>
      <div className="flex flex-col gap-4 p-3.5">
        <p className="text-sm" dir="auto">
          <strong>{nodes[relation.from_node]?.title}</strong>{' '}
          <span className="inline-block [&:dir(rtl)]:-scale-x-100">→</span>{' '}
          <strong>{nodes[relation.to_node]?.title}</strong>
        </p>
        <SelectField
          label={t('ws.panel.relationType')}
          value={relation.type}
          disabled={!canEdit}
          onChange={(e) => update(relation.id, { type: e.target.value as RelationType })}
          options={RELATION_TYPES.map((v) => ({ value: v, label: t(`ws.relations.${v}`) }))}
        />
        <TextField
          label={t('ws.panel.relationLabel')}
          placeholder={t('ws.relation.labelPlaceholder')}
          dir="auto"
          maxLength={40}
          readOnly={!canEdit}
          value={relation.label}
          onChange={(e) => update(relation.id, { label: e.target.value })}
        />
        {canEdit && relation.status === 'suggested' && (
          <Button onClick={() => update(relation.id, { status: 'accepted' })}>
            {t('ws.panel.accept')}
          </Button>
        )}
        {canEdit && relation.status === 'suggested' && (
          <Button variant="secondary" onClick={() => update(relation.id, { status: 'dismissed' })}>
            {t('ws.panel.dismiss')}
          </Button>
        )}
        {canEdit && relation.status !== 'suggested' && (
          <Button
            variant="secondary"
            className="bg-danger-soft"
            icon={<Trash size={15} aria-hidden />}
            onClick={() => remove(relation.id)}
          >
            {t('ws.panel.removeLink')}
          </Button>
        )}
      </div>
    </div>
  )
}
