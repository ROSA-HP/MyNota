import { CircleCheck, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, Spinner } from '@/components/ui'
import { useCanvasUi } from './canvas/canvasUi'
import { useLinks } from './linksStore'

/** "1–4" for a run of chapters, "1, 3 and 5" otherwise. */
function chapterRange(nums: number[], locale: string): string {
  const first = nums[0]
  const last = nums.at(-1)
  if (first === undefined || last === undefined) return ''
  if (nums.length > 2 && last - first + 1 === nums.length) return `${first}–${last}`
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(nums.map(String))
}

/**
 * Small note above the toolbar while the cross-links pass runs, and when it found something
 * ("Found 5 links between chapters 1–4. Accept the ones that help." + Review).
 */
export function LinksNotice() {
  const { t, i18n } = useTranslation()
  const status = useLinks((s) => s.status)
  const noticeSeen = useLinks((s) => s.noticeSeen)
  const seen = useLinks((s) => s.seen)
  const trayOpen = useCanvasUi((s) => s.linksTray)
  const openTray = useCanvasUi((s) => s.setLinksTray)
  if (trayOpen) return null

  if (status.state === 'running' || status.state === 'waiting')
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-full border-2 border-line bg-surface px-3.5 py-1.5 text-sm font-semibold neo-shadow-sm"
      >
        <Spinner size={13} />
        {status.scope === 'book' ? t('ws.suggest.runningBook') : t('ws.suggest.running')}
      </div>
    )

  if (status.state !== 'done' || status.found === 0 || noticeSeen) return null
  const text =
    status.chapters && status.chapters.length > 1
      ? t('ws.suggest.foundChapters', {
          count: status.found,
          range: chapterRange(status.chapters, i18n.language),
        })
      : t('ws.suggest.foundSections', { count: status.found })
  return (
    <div
      role="status"
      className="flex max-w-[min(640px,100%)] items-center gap-3 rounded-neo-lg border-2 border-line bg-surface py-2 ps-3.5 pe-2 neo-shadow"
    >
      <CircleCheck size={18} aria-hidden className="shrink-0 text-success" />
      <span className="text-sm">{text}</span>
      <Button
        size="sm"
        className="shrink-0"
        onClick={() => {
          seen()
          openTray(true)
        }}
      >
        {t('ws.suggest.review')}
      </Button>
      <IconButton label={t('ws.panel.close')} bordered={false} className="size-9" onClick={seen}>
        <X size={16} />
      </IconButton>
    </div>
  )
}
