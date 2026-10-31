import { useReactFlow } from '@xyflow/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Dialog, SelectField, toast } from '@/components/ui'
import { useDeck } from '@/features/study/deckStore'
import { useCanvasUi } from '@/features/workspace/canvas/canvasUi'
import { useWorkspace } from '@/features/workspace/workspaceStore'
import { cn } from '@/lib/cn'
import type { NodeRow, RelationRow } from '@/lib/database.types'
import { captureMap, download, fileName } from './capture'
import { outlineItems, toMarkdown, type OutlineOptions } from './outline'
import type { Paper } from './pdf'

type Format = 'pdf' | 'png' | 'md'
const FORMATS: Format[] = ['pdf', 'png', 'md']
const PAPERS: Paper[] = ['a4-landscape', 'a4-portrait', 'letter-landscape']

/** Every node under (and including) `id`. */
function subtree(nodes: Record<string, NodeRow>, id: string): Set<string> {
  const kids = new Map<string, string[]>()
  for (const n of Object.values(nodes))
    if (n.parent_id) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n.id])
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop() as string
    out.add(cur)
    stack.push(...(kids.get(cur) ?? []))
  }
  return out
}

/** Export the map: PDF (picture + outline), PNG picture, or Markdown outline. All on the device. */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const rf = useReactFlow()
  const map = useWorkspace((s) => s.map)
  const nodes = useWorkspace((s) => s.nodes)
  const relations = useWorkspace((s) => s.relations)
  const [format, setFormat] = useState<Format>('pdf')
  const [scope, setScope] = useState('all')
  const [paper, setPaper] = useState<Paper>('a4-landscape')
  const [opts, setOpts] = useState<OutlineOptions & { light: boolean }>({
    details: true,
    links: true,
    cards: false,
    light: true,
  })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const root = useMemo(
    () => Object.values(nodes).find((n) => !n.parent_id || !nodes[n.parent_id]),
    [nodes],
  )
  const parts = useMemo(
    () =>
      root
        ? Object.values(nodes)
            .filter((n) => n.parent_id === root.id)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [nodes, root],
  )
  const book = map?.type === 'book'
  if (!map || !root) return null

  const relationLabel = (r: RelationRow) => r.label || t(`ws.relations.${r.type}`)
  const scopeNode = scope === 'all' || scope === 'screen' ? root : (nodes[scope] ?? root)
  const title = scopeNode.id === root.id ? map.title : `${map.title} – ${scopeNode.title}`
  const dir = i18n.dir()

  async function run() {
    if (!map || !root) return
    setBusy(true)
    setFailed(null)
    // A clean picture: no selection, focus, filter or covered blocks while it is taken.
    const ui = useCanvasUi.getState()
    const ws = useWorkspace.getState()
    const saved = { focus: ui.focusId, filter: ui.filter, cover: ui.cover, selected: ws.selectedId }
    try {
      const items =
        format === 'png'
          ? []
          : outlineItems({
              nodes,
              relations,
              cards: Object.values(useDeck.getState().cards),
              rootId: scopeNode.id,
              options: opts,
              relationLabel,
            })
      if (format === 'md') {
        const text = toMarkdown(items, {
          cards: t('ws.cards.title'),
          source: t('export.madeWith', { date: new Date().toLocaleDateString(i18n.language) }),
        })
        download(fileName(title, 'md'), new Blob([text], { type: 'text/markdown;charset=utf-8' }))
        toast(t('export.done'), 'success')
        return onClose()
      }

      ui.setFocus(null)
      ui.setFilter('')
      ui.setCover(false)
      ws.select(null)
      const pictures: Array<{ dataUrl: string; width: number; height: number; caption: string }> =
        []
      const shot = async (ids: Set<string> | null, caption: string, screen = false) => {
        const p = await captureMap(rf, { ids, screen, light: opts.light, links: opts.links })
        pictures.push({ ...p, caption })
      }
      if (scope === 'screen') await shot(null, map.title, true)
      else if (scope !== 'all') await shot(subtree(nodes, scope), title)
      else if (book && format === 'pdf') {
        // A book: one page per built chapter, so every chapter stays readable.
        for (const ch of parts)
          if (Object.values(nodes).some((n) => n.parent_id === ch.id))
            await shot(subtree(nodes, ch.id), ch.title)
        if (!pictures.length) await shot(null, map.title)
      } else await shot(null, map.title)

      if (format === 'png') {
        const p = pictures[0]
        if (p) download(fileName(title, 'png'), p.dataUrl)
      } else {
        const { buildPdf } = await import('./pdf')
        const blob = await buildPdf({
          title,
          paper,
          pictures,
          outline: items,
          dir,
          labels: { outline: t('ws.outline'), cards: t('ws.cards.title'), footer: 'MyNota' },
        })
        download(fileName(title, 'pdf'), blob)
      }
      toast(t('export.done'), 'success')
      onClose()
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e))
    } finally {
      ui.setFocus(saved.focus)
      ui.setFilter(saved.filter)
      if (saved.cover) ui.setCover(true)
      if (saved.selected) ws.select(saved.selected)
      setBusy(false)
    }
  }

  const check = (k: keyof typeof opts, label: string, show: boolean) =>
    show && (
      <label
        key={k}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold"
      >
        <input
          type="checkbox"
          checked={opts[k]}
          onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })}
          className="size-5 accent-[var(--brand)]"
        />
        {label}
      </label>
    )

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={t('export.title', { title: map.title })}
      className="w-[min(94vw,36rem)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void run()} loading={busy}>
            {t(`export.download.${format}`)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t('export.format')}</legend>
          {FORMATS.map((f) => (
            <label
              key={f}
              className={cn(
                'flex cursor-pointer gap-3 rounded-neo border-2 p-3',
                format === f
                  ? 'border-line bg-brand-soft/50'
                  : 'border-line-soft hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="export-format"
                checked={format === f}
                onChange={() => {
                  setFormat(f)
                  if (f === 'md' && scope === 'screen') setScope('all')
                }}
                className="mt-1 size-4 accent-[var(--brand)]"
              />
              <span className="flex flex-col">
                <span className="font-bold">{t(`export.formats.${f}.name`)}</span>
                <span className="text-sm text-ink-muted">{t(`export.formats.${f}.hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('export.include')}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            options={[
              { value: 'all', label: book ? t('export.scope.book') : t('export.scope.map') },
              ...parts.map((p, i) => ({
                value: p.id,
                label: `${book ? t('export.scope.chapter', { n: i + 1 }) : t('export.scope.section', { n: i + 1 })} · ${p.title}`,
              })),
              ...(format === 'md' ? [] : [{ value: 'screen', label: t('export.scope.screen') }]),
            ]}
          />
          {format === 'pdf' && (
            <SelectField
              label={t('export.paper')}
              value={paper}
              onChange={(e) => setPaper(e.target.value as Paper)}
              options={PAPERS.map((p) => ({ value: p, label: t(`export.papers.${p}`) }))}
            />
          )}
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          {check('details', t('export.opts.details'), format !== 'png')}
          {check('links', t('export.opts.links'), true)}
          {check('cards', t('export.opts.cards'), format !== 'png')}
          {check('light', t('export.opts.light'), format !== 'md')}
        </div>

        {failed && <Alert tone="danger">{t('export.failed', { error: failed })}</Alert>}
        <p className="text-sm text-ink-muted">{t('export.local')}</p>
      </div>
    </Dialog>
  )
}
