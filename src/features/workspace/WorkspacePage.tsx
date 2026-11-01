import { useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import {
  Check,
  ChevronRight,
  Download,
  Eye,
  GitMerge,
  Layers,
  PanelLeft,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Alert, Badge, IconButton, Logo, Spinner, buttonClasses } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { useDeck } from '@/features/study/deckStore'
import { deckCounts } from '@/features/study/mastery'
import { ExportDialog } from '@/features/export/ExportDialog'
import { SearchButton, SearchPalette } from '@/features/search/SearchPalette'
import { ShareControls } from '@/features/sharing/ShareControls'
import { useDeckSync } from '@/features/study/useDeckSync'
import type { BookBuildRequest, BuildRequest } from '@/features/new-map/buildRequest'
import { useKeyFor } from '@/features/settings/aiKeyStore'
import { cn } from '@/lib/cn'
import type { SubjectRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { BuildBanner } from './BuildBanner'
import { FocusFromUrl } from './FocusFromUrl'
import { useBuild } from './buildStore'
import { MapCanvas } from './canvas/MapCanvas'
import { useCanvasUi } from './canvas/canvasUi'
import { LinksNotice } from './LinksNotice'
import { useLivePresence } from './live/LivePresence'
import { useLinks } from './linksStore'
import { ConnectHint, DeleteConfirm, NodeMenu, StudyViewBanner } from './Overlays'
import { AddNotesDialog } from './merge/AddNotesDialog'
import { LinksTray, useSuggestions } from './panels/LinksTray'
import { LinkPicker, LinkSearch } from './LinkPopovers'
import { NodePanel, RelationPanel } from './panels/NodePanel'
import { OutlinePanel } from './panels/OutlinePanel'
import { Toolbar } from './Toolbar'
import { useWorkspace } from './workspaceStore'

/** The map's subject for the breadcrumb (only the owner can read their subjects). */
function useSubject(subjectId: string | null | undefined) {
  const [subject, setSubject] = useState<Pick<SubjectRow, 'id' | 'name'> | null>(null)
  useEffect(() => {
    if (!subjectId) return
    let cancelled = false
    void supabase
      .from('subjects')
      .select('id, name')
      .eq('id', subjectId)
      .maybeSingle()
      .then(({ data }) => !cancelled && setSubject(data))
    return () => {
      cancelled = true
    }
  }, [subjectId])
  return subjectId && subject?.id === subjectId ? subject : null
}

function SaveIndicator() {
  const { t } = useTranslation()
  const state = useWorkspace((s) => s.saveState)
  const label = {
    saved: t('ws.saved'),
    saving: t('ws.saving'),
    pending: t('ws.unsaved'),
    error: t('ws.saveError'),
  }[state]
  return (
    <span
      role="status"
      // Each change of state fades in; "Saved" gets a little check that pops.
      key={state}
      className={cn(
        'hidden animate-fade items-center gap-1.5 text-[13px] font-semibold md:inline-flex',
        state === 'error' ? 'text-warning' : state === 'saved' ? 'text-success' : 'text-ink-muted',
      )}
    >
      {state === 'saving' && <Spinner size={12} />}
      {state === 'saved' && <Check size={14} strokeWidth={3} aria-hidden className="animate-pop" />}
      {label}
    </span>
  )
}

/** Top-bar button for the suggested-links tray, with the number waiting for review. */
function SuggestionsButton() {
  const { t } = useTranslation()
  const count = useSuggestions().length
  const open = useCanvasUi((s) => s.linksTray)
  const setOpen = useCanvasUi((s) => s.setLinksTray)
  const hasBlocks = useWorkspace((s) => Object.values(s.nodes).some((n) => n.level === 'block'))
  if (!hasBlocks && !count) return null
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={() => {
        useLinks.getState().seen()
        setOpen(!open)
      }}
      title={t('ws.suggest.title')}
      className={buttonClasses({
        variant: 'secondary',
        size: 'sm',
        className: cn(
          count > 0 && 'bg-ch-yellow hover:bg-ch-yellow',
          open && 'outline-2 outline-line',
        ),
      })}
    >
      <Sparkles size={16} aria-hidden />
      <span className="hidden xl:inline">{t('ws.suggest.open')}</span>
      {count > 0 && (
        <span className="rounded-full bg-selected px-1.5 font-mono text-xs font-bold text-selected-ink">
          {count}
        </span>
      )}
    </button>
  )
}

/** Opens "Add notes" (merge new notes into this map). Not while the map is being built. */
/** Opens a study session for this map; the badge counts cards due now. */
function StudyButton({ mapId }: { mapId: string }) {
  const { t } = useTranslation()
  const due = useDeck((s) =>
    s.mapId === mapId && s.status === 'ready'
      ? deckCounts(Object.values(s.cards), s.progress).due
      : 0,
  )
  const hasCards = useDeck(
    (s) => s.mapId === mapId && Object.values(s.cards).some((c) => !c.suspended),
  )
  if (!hasCards) return null
  return (
    <Link
      to={`/maps/${mapId}/study`}
      className={buttonClasses({ variant: 'secondary', size: 'sm' })}
    >
      <Layers size={16} aria-hidden />
      <span className="hidden xl:inline">{t('ws.study')}</span>
      {due > 0 && <Badge tone="brand">{due}</Badge>}
    </Link>
  )
}

function AddNotesButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const canEdit = useWorkspace((s) => s.role === 'owner' || s.role === 'editor')
  const fromCache = useWorkspace((s) => s.fromCache)
  const building = useBuild((s) => s.phase === 'outline' || s.phase === 'details')
  if (!canEdit || fromCache) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={building}
      title={t('ws.merge.open')}
      className={buttonClasses({
        variant: 'secondary',
        size: 'sm',
      })}
    >
      <GitMerge size={16} aria-hidden />
      <span className="hidden xl:inline">{t('ws.merge.open')}</span>
    </button>
  )
}

function Workspace() {
  const { t } = useTranslation()
  const { mapId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const userId = useAuth((s) => s.session?.user.id)
  const {
    status,
    map,
    role,
    fromCache,
    nodes,
    selectedId,
    selectedRelationId,
    relations,
    load,
    select,
    selectRelation,
  } = useWorkspace()
  const startBuild = useBuild((s) => s.start)
  const enqueue = useBuild((s) => s.enqueue)
  const buildMapId = useBuild((s) => s.mapId)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const linksTray = useCanvasUi((s) => s.linksTray)
  const blockPanel = useCanvasUi((s) => s.panelOpen)
  const [addNotesOpen, setAddNotesOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const subject = useSubject(map?.subject_id)
  useDeckSync(mapId)
  useLivePresence(mapId, userId)
  const setLinksTray = useCanvasUi((s) => s.setLinksTray)
  const started = useRef(false)

  useEffect(() => {
    if (userId && mapId) void load(mapId, userId)
  }, [mapId, userId, load])

  // Coming from the new-map flow: start building once the map is open, then drop the router
  // state so a refresh never starts a second run.
  const request = (location.state as { build?: BuildRequest | BookBuildRequest } | null)?.build
  const key = useKeyFor(request?.provider)
  useEffect(() => {
    if (
      !request ||
      started.current ||
      status !== 'ready' ||
      fromCache ||
      !key ||
      buildMapId === mapId
    )
      return
    started.current = true
    if ('book' in request) {
      // Chapters already have their saved paragraphs (one source per chapter).
      const { nodes: allNodes, sources } = useWorkspace.getState()
      const jobs = request.chapterIds.flatMap((chapterId) => {
        const chapter = allNodes[chapterId]
        const source = sources.find((src) => src.chapter_node_id === chapterId)
        if (!chapter || !source) return []
        return [
          {
            mapId,
            rootId: chapterId,
            title: chapter.title,
            paragraphs: source.paragraphs.map((p) => ({ n: p.n, text: p.text })),
            sourceLanguage: request.sourceLanguage,
            explanationLanguage: request.explanationLanguage,
            detailLevel: request.detailLevel,
            bookTitle: request.bookTitle,
          },
        ]
      })
      enqueue(jobs, key)
    } else {
      void startBuild({ mapId, ...request }, key)
    }
    navigate(location.pathname, { replace: true, state: null })
  }, [
    request,
    status,
    fromCache,
    key,
    mapId,
    buildMapId,
    startBuild,
    enqueue,
    navigate,
    location.pathname,
  ])

  useEffect(
    () => () => {
      useBuild.getState().clear()
      useLinks.getState().reset()
      useCanvasUi.getState().setLinksTray(false)
    },
    [mapId],
  )

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex h-dvh items-center justify-center bg-paper">
        <Spinner size={28} />
      </div>
    )
  }
  if (status === 'notFound' || status === 'error' || !map) {
    return (
      <main
        id="main"
        className="paper-dots flex h-dvh flex-col items-center justify-center gap-5 p-6 text-center"
      >
        <Logo />
        <h1 className="text-2xl font-bold">
          {status === 'notFound' ? t('ws.notFoundTitle') : t('ws.loadFailed')}
        </h1>
        {status === 'notFound' && <p className="text-ink-muted">{t('ws.notFoundBody')}</p>}
        <Link to="/library" className={buttonClasses({})}>
          {t('ws.backToLibrary')}
        </Link>
      </main>
    )
  }

  // A selected block opens in place on the canvas; the panel only when asked (Open, double-click).
  const selected = selectedId ? nodes[selectedId] : undefined
  const selectedNode = selected && (selected.level !== 'block' || blockPanel) ? selected : undefined
  const selectedRelation = selectedRelationId ? relations[selectedRelationId] : undefined
  const panelOpen = Boolean(selectedNode || selectedRelation || linksTray)
  const closePanel = () => {
    // Closing the panel of a block keeps the block open on the canvas.
    if (selected?.level === 'block') return useCanvasUi.getState().setPanelOpen(false)
    select(null)
    selectRelation(null)
  }

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <header className="z-20 flex h-[60px] shrink-0 items-center gap-2.5 border-b-2 border-line bg-surface px-3 sm:px-4">
        <IconButton
          label={t('ws.outline')}
          className="xl:hidden"
          aria-expanded={outlineOpen}
          onClick={() => setOutlineOpen((o) => !o)}
        >
          <PanelLeft size={19} className="rtl:-scale-x-100" />
        </IconButton>
        <Link to="/library" className="shrink-0 rounded-neo" aria-label={t('ws.backToLibrary')}>
          <Logo withText={false} />
        </Link>
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink-muted"
        >
          <Link to="/library" className="hidden hover:text-ink sm:inline">
            {t('nav.library')}
          </Link>
          <ChevronRight
            size={14}
            aria-hidden
            className="hidden shrink-0 sm:block rtl:-scale-x-100"
          />
          {subject && (
            <>
              <Link
                to={`/library?subject=${subject.id}`}
                dir="auto"
                className="hidden max-w-40 truncate hover:text-ink md:inline"
              >
                {subject.name}
              </Link>
              <ChevronRight
                size={14}
                aria-hidden
                className="hidden shrink-0 md:block rtl:-scale-x-100"
              />
            </>
          )}
          <h1 dir="auto" className="truncate text-base font-bold text-ink">
            {map.title}
          </h1>
        </nav>
        <SaveIndicator />
        {(role === 'viewer' || fromCache) && (
          <Badge tone="neutral" className="shrink-0">
            <Eye size={12} aria-hidden /> {fromCache ? t('ws.fromCache') : t('ws.readOnly')}
          </Badge>
        )}
        <div className="ms-auto flex items-center gap-2">
          <SearchButton compact />
          <IconButton label={t('export.open')} onClick={() => setExportOpen(true)}>
            <Download size={18} aria-hidden />
          </IconButton>
          <AddNotesButton onOpen={() => setAddNotesOpen(true)} />
          <SuggestionsButton />
          <StudyButton mapId={mapId} />
          <ShareControls mapId={mapId} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Outline: docked on desktop, drawer on tablet. */}
        <aside
          aria-label={t('ws.outline')}
          className={cn(
            'z-30 w-[264px] shrink-0 border-e-2 border-line bg-surface-muted',
            'max-xl:absolute max-xl:inset-y-0 max-xl:start-0 max-xl:neo-shadow-lg max-xl:transition-[translate,visibility] max-xl:duration-300 max-xl:ease-soft',
            outlineOpen
              ? ''
              : 'max-xl:pointer-events-none max-xl:invisible max-xl:ltr:-translate-x-full max-xl:rtl:translate-x-full',
          )}
        >
          <OutlinePanel onNavigate={() => setOutlineOpen(false)} />
        </aside>

        <main id="main" className="relative min-w-0 flex-1">
          <MapCanvas />
          <FocusFromUrl />
          <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-3 [&>*]:pointer-events-auto">
            <ConnectHint />
            <StudyViewBanner />
          </div>
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2.5 px-3 [&>*]:pointer-events-auto',
              // On tablet the details sheet covers the right side: keep the toolbar beside it.
              panelOpen && 'max-xl:pe-[min(372px,92vw)]',
            )}
          >
            {request && !key && (
              <Alert tone="warning">
                <Link to="/settings" className="font-semibold underline">
                  {t('ws.build.needKey')}
                </Link>
              </Alert>
            )}
            <LinksNotice />
            <BuildBanner />
            <Toolbar />
          </div>
        </main>

        {/* Details: docked on desktop, slide-over sheet on tablet. */}
        {panelOpen && (
          <aside
            aria-label={t('ws.panel.label')}
            // The sheet slides in; each block opened in it fades in.
            className="mynota-sheet z-30 w-[360px] max-w-[92vw] shrink-0 border-s-2 border-line bg-surface max-xl:absolute max-xl:inset-y-0 max-xl:end-0 max-xl:neo-shadow-lg [&>*]:animate-fade"
          >
            {selectedNode ? (
              <NodePanel key={selectedNode.id} node={selectedNode} onClose={closePanel} />
            ) : linksTray ? (
              <LinksTray onClose={() => setLinksTray(false)} />
            ) : selectedRelation ? (
              <RelationPanel relation={selectedRelation} onClose={closePanel} />
            ) : null}
          </aside>
        )}
      </div>

      <NodeMenu />
      <LinkPicker />
      <LinkSearch />
      <DeleteConfirm />
      <SearchPalette />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <AddNotesDialog open={addNotesOpen} onClose={() => setAddNotesOpen(false)} />
    </div>
  )
}

export function WorkspacePage() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  )
}
