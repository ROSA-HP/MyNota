import { useEffect, useState } from 'react'
import type { ParseKeys } from 'i18next'
import { CheckCircle2, Clock, RotateCcw, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button, Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useKeyFor } from '@/features/settings/aiKeyStore'
import { useBuild, type SectionStatus } from './buildStore'
import { useWorkspace } from './workspaceStore'

/** Current time, ticking every second while `active` (for countdowns). */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/** "Building your map" banner: progress, rate-limit countdown, stop and retry. */
export function BuildBanner() {
  const { t } = useTranslation()
  const {
    phase: chapterPhase,
    outlineStatus,
    sections,
    order,
    failure,
    stop,
    retryOutline,
    clear,
    chapters,
    chapterOrder,
    currentChapter,
  } = useBuild()
  const chapterTitle = useWorkspace((s) => (currentChapter ? s.nodes[currentChapter]?.title : null))
  // A book builds chapter after chapter: between two chapters the run is still going.
  const phase = currentChapter && chapterPhase === 'done' ? 'details' : chapterPhase
  const chapterIndex = currentChapter ? chapterOrder.indexOf(currentChapter) + 1 : 0
  const failedChapters = chapterOrder.filter((id) => chapters[id] === 'failed').length
  const key = useKeyFor(useBuild((s) => s.provider))
  const statuses: SectionStatus[] = [outlineStatus, ...Object.values(sections)]
  const waiting = statuses.find(
    (s): s is Extract<SectionStatus, { state: 'waiting' }> => s.state === 'waiting',
  )
  const now = useNow(Boolean(waiting))

  useEffect(() => {
    if (phase !== 'done') return
    const id = setTimeout(clear, 4000)
    return () => clearTimeout(id)
  }, [phase, clear])

  if (phase === 'idle') return null
  const done = order.filter((id) => sections[id]?.state === 'done').length
  const failed = order.filter((id) => sections[id]?.state === 'failed').length
  const total = order.length
  const pct = phase === 'outline' ? 8 : total ? Math.round(((done + failed) / total) * 100) : 0
  const busy = phase === 'outline' || phase === 'details'

  return (
    <div
      role="status"
      className="w-[min(620px,calc(100vw-2rem))] animate-rise rounded-neo-lg border-2 border-line bg-surface p-3.5 neo-shadow"
    >
      <div className="flex items-center gap-2.5">
        {busy ? (
          <Sparkles size={18} aria-hidden className="mynota-twinkle text-brand" />
        ) : phase === 'done' && failedChapters === 0 ? (
          <CheckCircle2 size={18} aria-hidden className="animate-pop text-success" />
        ) : null}
        <strong className="text-[15px]">
          {phase === 'done' && failedChapters === 0
            ? t('ws.build.done')
            : phase === 'done'
              ? t('ws.build.someFailed')
              : phase === 'stopped'
                ? t('ws.build.stopped')
                : phase === 'failed'
                  ? failure && outlineStatus.state === 'failed'
                    ? t(`ai.errors.${failure}` as ParseKeys)
                    : t('ws.build.someFailed')
                  : t('ws.build.title')}
        </strong>
        {total > 0 && (
          <span className="text-xs font-semibold tabular-nums text-ink-muted">
            {t('ws.build.progress', { done, total })}
          </span>
        )}
        <span className="ms-auto flex gap-1.5">
          {busy && (
            <Button size="sm" variant="secondary" onClick={stop}>
              {t('ws.build.stop')}
            </Button>
          )}
          {phase === 'failed' && outlineStatus.state === 'failed' && key && (
            <Button
              size="sm"
              icon={<RotateCcw size={15} aria-hidden />}
              onClick={() => void retryOutline(key)}
            >
              {t('ws.build.retryOutline')}
            </Button>
          )}
          {!busy && (
            <button
              type="button"
              aria-label={t('ws.build.dismiss')}
              onClick={clear}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md pointer-coarse:size-11 hover:bg-paper-sunken"
            >
              <X size={16} />
            </button>
          )}
        </span>
      </div>
      {busy && chapterOrder.length > 1 && chapterIndex > 0 && (
        <p dir="auto" className="mt-1 truncate text-sm font-semibold text-ink-muted">
          {t('ws.build.chapterOf', {
            n: chapterIndex,
            total: chapterOrder.length,
            title: chapterTitle ?? '',
          })}
        </p>
      )}
      {busy && (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-2.5 h-2.5 overflow-hidden rounded-full border-2 border-line bg-paper-sunken"
          >
            <div
              className="mynota-stripes h-full bg-brand transition-[width] duration-700 ease-spring"
              style={{ width: `${pct}%` }}
            />
          </div>
          {total > 0 && (
            // One square per section: it fills in with a pop when that section is ready.
            <div aria-hidden className="mt-2 flex flex-wrap gap-1">
              {order.slice(0, 40).map((id) => {
                const state = sections[id]?.state ?? 'queued'
                return (
                  <span
                    key={`${id}:${state}`}
                    className={cn(
                      'size-3 rounded-[3px] border-[1.5px] border-line',
                      state === 'done' && 'animate-pop bg-brand',
                      state === 'failed' && 'animate-pop bg-danger',
                      state === 'running' && 'mynota-breathe bg-brand-soft',
                      state === 'waiting' && 'bg-warning-soft',
                      state === 'queued' && 'bg-paper-sunken',
                    )}
                  />
                )
              })}
            </div>
          )}
          {phase === 'outline' && !waiting && (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
              <Spinner size={13} /> {t('ws.build.outline')}
            </p>
          )}
        </>
      )}
      {waiting && busy && (
        <p className="mt-2.5 flex items-center gap-2 rounded-neo border-2 border-line bg-warning-soft px-2.5 py-1.5 text-sm font-semibold">
          <Clock size={15} aria-hidden />
          {t('ws.build.waiting', { s: Math.max(0, Math.ceil((waiting.until - now) / 1000)) })}
        </p>
      )}
      {!key && busy && (
        <p className="mt-2 text-sm">
          <Link to="/settings" className="font-semibold underline">
            {t('ws.build.needKey')}
          </Link>
        </p>
      )}
    </div>
  )
}
