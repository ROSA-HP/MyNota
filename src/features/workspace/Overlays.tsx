import { useEffect, useRef, useState } from 'react'
import { Link2, Plus, SquarePen, Trash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { makeRelation } from '@/ai/pipeline/convert'
import { RELATION_TYPES } from '@/ai/schemas/common'
import { Button, Dialog, SelectField, TextField } from '@/components/ui'
import type { RelationType } from '@/lib/database.types'
import { useCanvasUi } from './canvas/canvasUi'
import { useAddChild } from './canvas/MapCanvas'
import { useWorkspace } from './workspaceStore'

/** Right-click / long-press menu on a node. */
export function NodeMenu() {
  const { t } = useTranslation()
  const { menu, closeMenu, startConnect, askDelete } = useCanvasUi()
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
      className="fixed z-50 w-52 rounded-neo-lg border-2 border-line bg-surface p-1.5 text-ink neo-shadow"
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
            onClick={() => startConnect(node.id)}
          >
            <Link2 size={17} aria-hidden /> {t('ws.connect')}
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

/** After picking two nodes in connect mode: choose the link type and label. */
export function RelationDialog() {
  const { t } = useTranslation()
  const { newRelation, closeRelationDialog } = useCanvasUi()
  const nodes = useWorkspace((s) => s.nodes)
  const map = useWorkspace((s) => s.map)
  const addRelations = useWorkspace((s) => s.addRelations)
  const selectRelation = useWorkspace((s) => s.selectRelation)
  const [type, setType] = useState<RelationType>('related')
  const [label, setLabel] = useState('')

  if (!newRelation || !map) return null
  const from = nodes[newRelation.from]
  const to = nodes[newRelation.to]
  const create = () => {
    const r = makeRelation({
      map_id: map.id,
      from_node: newRelation.from,
      to_node: newRelation.to,
      type,
      label: label.trim().slice(0, 40),
    })
    addRelations([r])
    selectRelation(r.id)
    setLabel('')
    setType('related')
    closeRelationDialog()
  }
  return (
    <Dialog
      open
      onClose={closeRelationDialog}
      title={t('ws.relation.title')}
      footer={
        <>
          <Button variant="ghost" onClick={closeRelationDialog}>
            {t('common.cancel')}
          </Button>
          <Button onClick={create}>{t('ws.relation.create')}</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <p className="text-sm" dir="auto">
          <strong>{from?.title}</strong> → <strong>{to?.title}</strong>
        </p>
        <SelectField
          label={t('ws.panel.relationType')}
          value={type}
          onChange={(e) => setType(e.target.value as RelationType)}
          options={RELATION_TYPES.map((v) => ({ value: v, label: t(`ws.relations.${v}`) }))}
        />
        <TextField
          label={t('ws.panel.relationLabel')}
          placeholder={t('ws.relation.labelPlaceholder')}
          value={label}
          maxLength={40}
          dir="auto"
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </form>
    </Dialog>
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

export function ConnectHint() {
  const { t } = useTranslation()
  const connecting = useCanvasUi((s) => s.connecting)
  if (!connecting) return null
  return (
    <div
      role="status"
      className="rounded-full border-2 border-line bg-brand-soft px-4 py-2 text-sm font-semibold text-ink neo-shadow-sm"
    >
      {t('ws.connectHint')}
    </div>
  )
}
