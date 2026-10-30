import {
  BookOpen,
  FileText,
  KeyRound,
  Plus,
  RotateCcw,
  Square,
  Sparkles,
  ClipboardPaste,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, Badge, Button, Panel, Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import type { MapRow } from '@/lib/database.types'
import { MapPreviewArt } from './MapPreviewArt'
import { useLibrary } from './useLibrary'

const COVER: Record<MapRow['cover_color'], string> = {
  yellow: 'bg-ch-yellow',
  coral: 'bg-ch-coral',
  sky: 'bg-ch-sky',
  mint: 'bg-ch-mint',
  lavender: 'bg-ch-lavender',
  pink: 'bg-ch-pink',
  orange: 'bg-ch-orange',
  lime: 'bg-ch-lime',
}
const TYPE_ICON = { book: BookOpen, notes: FileText, blank: Square }

function EmptyLibrary() {
  const { t } = useTranslation()
  const steps = [
    { Icon: KeyRound, label: t('library.empty.step1'), tint: 'bg-ch-yellow' },
    { Icon: ClipboardPaste, label: t('library.empty.step2'), tint: 'bg-ch-sky' },
    { Icon: Sparkles, label: t('library.empty.step3'), tint: 'bg-ch-mint' },
  ]
  return (
    <Panel
      shadow="lg"
      className="grid items-center gap-8 overflow-hidden p-6 md:grid-cols-[1fr_1.1fr] md:p-10"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('library.empty.title')}</h2>
        <p className="mt-2 text-ink-muted">{t('library.empty.body')}</p>
        <ol className="mt-6 flex flex-col gap-3">
          {steps.map(({ Icon, label, tint }, i) => (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-neo border-2 border-line text-ink',
                  tint,
                )}
              >
                <Icon size={19} aria-hidden />
              </span>
              <span className="font-mono text-sm font-bold text-ink-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-semibold">{label}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-neo-lg border-2 border-line bg-paper p-2" aria-hidden>
        <MapPreviewArt className="block h-auto w-full opacity-90" />
      </div>
    </Panel>
  )
}

function MapCard({ map }: { map: MapRow }) {
  const { t, i18n } = useTranslation()
  const Icon = TYPE_ICON[map.type]
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
    new Date(map.updated_at),
  )
  return (
    <Panel className="overflow-hidden">
      <div className={cn('h-20 border-b-2 border-line', COVER[map.cover_color])} />
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Badge>
            <Icon size={12} aria-hidden /> {t(`library.types.${map.type}`)}
          </Badge>
        </div>
        <h3 className="mt-2 line-clamp-2 font-bold" dir="auto">
          {map.title}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">{t('library.updated', { date })}</p>
      </div>
    </Panel>
  )
}

export function LibraryPage() {
  const { t } = useTranslation()
  const profile = useAuth((s) => s.profile)
  const { state, reload } = useLibrary()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {profile && (
            <p className="font-semibold text-ink-muted" dir="auto">
              {t('library.greeting', { name: profile.name || profile.username })}
            </p>
          )}
          <h1 className="text-3xl font-bold tracking-tight">{t('library.title')}</h1>
          {state.status === 'ready' && (
            <p className="mt-1 text-sm font-semibold text-ink-muted">
              {t('library.mapCount', { count: state.maps.length })}
            </p>
          )}
        </div>
        <Button icon={<Plus size={18} aria-hidden />} disabled title={t('library.newMapSoon')}>
          {t('library.newMap')}
          <Badge tone="neutral" className="ms-1">
            {t('common.soon')}
          </Badge>
        </Button>
      </div>

      <div className="mt-8">
        {state.status === 'loading' && (
          <div className="flex justify-center py-20">
            <Spinner size={28} />
          </div>
        )}
        {state.status === 'error' && (
          <Alert tone="danger">
            <div className="flex flex-wrap items-center gap-3">
              {t('library.loadFailed')}
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={15} aria-hidden />}
                onClick={() => void reload()}
              >
                {t('library.retry')}
              </Button>
            </div>
          </Alert>
        )}
        {state.status === 'ready' &&
          (state.maps.length === 0 ? (
            <EmptyLibrary />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {state.maps.map((m) => (
                <MapCard key={m.id} map={m} />
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}
