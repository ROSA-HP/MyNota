import { Network, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, Button, IconButton, SelectField, toast } from '@/components/ui'
import { Field, controlClasses } from '@/components/ui/Field'
import type { CardType } from '@/lib/database.types'
import { CLOZE } from '../autoCards'
import { useDeck } from '../deckStore'
import { interval } from '../fsrs'
import type { StudyData } from '../useStudyData'

const TYPES: CardType[] = ['basic', 'reversed', 'cloze', 'vocab']
/** Literal braces for the cloze hints (i18next would read {{…}} in a message as a variable). */
const BRACES = { open: '{{', close: '}}', interpolation: { escapeValue: false } }

function TextArea({
  label,
  hint,
  error,
  value,
  onChange,
  readOnly,
  rows = 3,
}: {
  label: string
  hint?: string
  error?: string | null
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  rows?: number
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          dir="auto"
          rows={rows}
          value={value}
          readOnly={readOnly}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`${controlClasses(invalid)} min-h-20 resize-y py-2.5 leading-relaxed`}
        />
      )}
    </Field>
  )
}

/** Edit one card (or write a new one). Viewers see it read-only but can reset their own progress. */
export function CardEditor({
  mapId,
  cardId,
  data,
  canEdit,
  onClose,
  onCreated,
}: {
  mapId: string
  /** null: a new card. */
  cardId: string | null
  data: StudyData
  canEdit: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  const card = useDeck((s) => (cardId ? s.cards[cardId] : undefined))
  const memory = useDeck((s) => (cardId ? s.progress[cardId] : undefined))
  const [type, setType] = useState<CardType>(card?.type ?? 'basic')
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [nodeId, setNodeId] = useState(card?.node_id ?? '')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<null | 'delete' | 'reset'>(null)
  const [failed, setFailed] = useState(false)
  const [tried, setTried] = useState(false)
  const [now] = useState(() => new Date())

  const frontError = !front.trim()
    ? t('deck.editor.required')
    : type === 'cloze' && !CLOZE.test(front)
      ? t('deck.editor.needGap', BRACES)
      : front.length > 1000
        ? t('deck.editor.tooLong', { max: 1000 })
        : null
  const backError =
    type !== 'cloze' && !back.trim()
      ? t('deck.editor.required')
      : back.length > 2000
        ? t('deck.editor.tooLong', { max: 2000 })
        : null
  const dirty = !card || type !== card.type || front !== card.front || back !== card.back
  const place = card?.node_id ? data.places.get(card.node_id) : undefined
  const blocks = [...data.places.entries()].sort(
    (a, b) => (data.order.get(a[0]) ?? 0) - (data.order.get(b[0]) ?? 0),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!canEdit || frontError || backError) return
    setSaving(true)
    setFailed(false)
    try {
      const patch = { type, front: front.trim(), back: back.trim() }
      if (card) {
        await useDeck.getState().updateCard(card.id, patch)
      } else {
        const row = await useDeck.getState().addCard({
          ...patch,
          node_id: nodeId || null,
          languages: [],
          origin: 'manual',
          source_key: null,
        })
        onCreated(row.id)
      }
      toast(t('common.saved'), 'success')
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!card) return
    if (confirm !== 'delete') return setConfirm('delete')
    try {
      await useDeck.getState().removeCard(card.id)
      toast(t('deck.editor.deleted'), 'success')
      onClose()
    } catch {
      setFailed(true)
    }
  }

  async function onReset() {
    if (!card) return
    if (confirm !== 'reset') return setConfirm('reset')
    setConfirm(null)
    try {
      await useDeck.getState().resetProgress(card.id)
      toast(t('deck.editor.resetDone'), 'success')
    } catch {
      setFailed(true)
    }
  }

  const next = memory ? interval(now, new Date(memory.due)) : null
  const dueNow = memory ? new Date(memory.due) <= now : false

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold">
          {card ? t('deck.editor.title') : t('deck.editor.newTitle')}
        </h2>
        <IconButton
          label={t('common.close')}
          bordered={false}
          className="ms-auto"
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </IconButton>
      </div>
      {failed && <Alert tone="danger">{t('common.errorGeneric')}</Alert>}
      {!canEdit && <p className="text-sm text-ink-muted">{t('deck.editor.viewOnly')}</p>}

      <SelectField
        label={t('deck.editor.type')}
        value={type}
        disabled={!canEdit}
        onChange={(e) => setType(e.target.value as CardType)}
        options={TYPES.map((v) => ({ value: v, label: t(`deck.types.${v}`) }))}
      />
      <TextArea
        label={type === 'cloze' ? t('deck.editor.sentence') : t('deck.editor.front')}
        hint={type === 'cloze' ? t('deck.editor.clozeHint', BRACES) : undefined}
        value={front}
        onChange={setFront}
        readOnly={!canEdit}
        error={tried ? frontError : null}
      />
      <TextArea
        label={type === 'cloze' ? t('deck.editor.extra') : t('deck.editor.back')}
        value={back}
        onChange={setBack}
        readOnly={!canEdit}
        error={tried ? backError : null}
      />
      {(type === 'reversed' || type === 'vocab') && (
        <p className="-mt-2 text-xs text-ink-muted">{t('deck.editor.bothWays')}</p>
      )}

      {!card && canEdit && (
        <SelectField
          label={t('deck.editor.block')}
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          options={[
            { value: '', label: t('deck.editor.noBlock') },
            ...blocks.map(([id, p]) => ({
              value: id,
              label: p.chapter ? `${p.chapter.n} · ${p.title}` : p.title,
            })),
          ]}
        />
      )}

      {card && (
        <div className="flex flex-col gap-1 rounded-neo border-2 border-line-soft bg-surface-muted p-3 text-sm">
          {place && card.node_id ? (
            <>
              <span className="text-xs font-semibold text-ink-muted">
                {t('deck.editor.fromBlock')}
              </span>
              <Link
                to={`/maps/${mapId}?node=${card.node_id}`}
                className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"
              >
                <Network size={14} aria-hidden />
                <span dir="auto">{place.title}</span>
              </Link>
            </>
          ) : null}
          <span className="text-xs text-ink-muted">
            {place?.chapter && (
              <>{t('study.chapter', { n: place.chapter.n, name: place.chapter.title })} · </>
            )}
            {t(`deck.origin.${card.origin}`)}
          </span>
        </div>
      )}

      {card && (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-ink-muted">{t('deck.editor.reviews')}</dt>
            <dd className="text-xl font-bold tabular-nums">{memory?.reps ?? 0}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t('deck.editor.lapses')}</dt>
            <dd className="text-xl font-bold tabular-nums">{memory?.lapses ?? 0}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t('deck.editor.next')}</dt>
            <dd className="text-xl font-bold">
              {!memory
                ? t('deck.next.new')
                : dueNow || !next
                  ? t('deck.next.now')
                  : t(`study.units.${next.unit}`, { n: next.value })}
            </dd>
          </div>
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t-2 border-line-soft pt-4">
        {card && canEdit && (
          <Button
            type="button"
            variant={confirm === 'delete' ? 'danger' : 'ghost'}
            size="sm"
            onClick={() => void onDelete()}
          >
            {confirm === 'delete' ? t('deck.editor.confirmDelete') : t('deck.editor.delete')}
          </Button>
        )}
        {card && memory && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void onReset()}>
            {confirm === 'reset' ? t('deck.editor.confirmReset') : t('deck.editor.reset')}
          </Button>
        )}
        {canEdit && (
          <Button type="submit" size="sm" className="ms-auto" loading={saving} disabled={!dirty}>
            {card ? t('common.save') : t('deck.editor.add')}
          </Button>
        )}
      </div>
    </form>
  )
}
