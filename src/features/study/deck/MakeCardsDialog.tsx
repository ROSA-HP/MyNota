import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert, Button, Dialog, SelectField, toast } from '@/components/ui'
import { useAiKey } from '@/features/settings/aiKeyStore'
import { useDeck } from '../deckStore'
import { deckGroups } from '../outline'
import type { StudyData } from '../useStudyData'
import { makeCards } from './makeCards'

const COUNTS = [5, 10, 20]

/** "Make cards with AI": the student's own AI writes new cards for a chapter (or the map). */
export function MakeCardsDialog({
  open,
  onClose,
  mapId,
  data,
}: {
  open: boolean
  onClose: () => void
  mapId: string
  data: StudyData
}) {
  const { t } = useTranslation()
  const key = useAiKey((s) => s.key)
  const groups = deckGroups(data.nodes).filter((g) => g.built && g.blocks.size > 0)
  const [scope, setScope] = useState(groups[0]?.id ?? 'all')
  const [count, setCount] = useState(10)
  const [busy, setBusy] = useState(false)
  const [waitUntil, setWaitUntil] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [none, setNone] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const close = () => {
    abort.current?.abort()
    setBusy(false)
    setError(null)
    setNone(false)
    onClose()
  }

  async function run() {
    if (!key) return
    const group = groups.find((g) => g.id === scope)
    const blockIds = group ? [...group.blocks] : [...data.places.keys()]
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setError(null)
    setNone(false)
    try {
      const drafts = await makeCards({
        mapId,
        title: group ? `${data.title} › ${group.title}` : data.title,
        blockIds,
        order: data.order,
        count,
        key,
        signal: ctrl.signal,
        onWait: setWaitUntil,
      })
      const added = await useDeck.getState().addDrafts(drafts)
      if (!added) return setNone(true)
      toast(t('deck.make.added', { count: added }), 'success')
      close()
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setWaitUntil(null)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('deck.make.title')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void run()} loading={busy} disabled={!key}>
            {t('deck.make.run', { count })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{t('deck.make.body')}</p>
        {!key && (
          <Alert tone="warning">
            <Link to="/settings" className="font-semibold underline">
              {t('ws.build.needKey')}
            </Link>
          </Alert>
        )}
        <SelectField
          label={data.type === 'book' ? t('deck.col.chapter') : t('deck.col.section')}
          value={scope}
          disabled={busy}
          onChange={(e) => setScope(e.target.value)}
          options={[
            ...groups.map((g) => ({ value: g.id, label: `${g.n} · ${g.title}` })),
            { value: 'all', label: t('deck.make.whole') },
          ]}
        />
        <SelectField
          label={t('deck.make.count')}
          value={String(count)}
          disabled={busy}
          onChange={(e) => setCount(Number(e.target.value))}
          options={COUNTS.map((c) => ({ value: String(c), label: String(c) }))}
        />
        {busy && waitUntil && <p className="text-sm text-ink-muted">{t('deck.make.waiting')}</p>}
        {none && <Alert tone="info">{t('deck.make.none')}</Alert>}
        {error && <Alert tone="danger">{t('deck.make.failed', { error })}</Alert>}
      </div>
    </Dialog>
  )
}
