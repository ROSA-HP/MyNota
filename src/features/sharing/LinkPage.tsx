import { ReactFlowProvider } from '@xyflow/react'
import { Copy, Download, Flag, LogIn, Network, PanelLeft, PencilLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Badge, Button, IconButton, Logo, Spinner, buttonClasses, toast } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { ExportDialog } from '@/features/export/ExportDialog'
import { MapCanvas } from '@/features/workspace/canvas/MapCanvas'
import { FocusFromUrl } from '@/features/workspace/FocusFromUrl'
import { StudyViewBanner } from '@/features/workspace/Overlays'
import { NodePanel, RelationPanel } from '@/features/workspace/panels/NodePanel'
import { OutlinePanel } from '@/features/workspace/panels/OutlinePanel'
import { Toolbar } from '@/features/workspace/Toolbar'
import { useWorkspace } from '@/features/workspace/workspaceStore'
import { cn } from '@/lib/cn'
import type { LinkView } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { ReportDialog } from './ReportDialog'
import { shareError } from './shareApi'

type State =
  | { status: 'loading' }
  | { status: 'ready'; view: LinkView }
  | { status: 'missing' | 'off' | 'error' }

/** What a visitor asked for before signing in; done once they are back. */
type Pending = 'join' | 'copy' | 'report'

/** /s/:token — a map shared by link: read only for anyone, join / copy / report when signed in. */
export function LinkPage() {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ status: 'loading' })
  const authStatus = useAuth((s) => s.status)

  useEffect(() => {
    if (authStatus === 'loading') return
    let alive = true
    void supabase.rpc('link_open', { p_token: token }).then(({ data, error }) => {
      if (!alive) return
      if (error)
        return setState({
          status: error.code === 'MN404' ? 'missing' : error.code === 'MN410' ? 'off' : 'error',
        })
      useWorkspace.getState().showLink(data)
      setState({ status: 'ready', view: data })
    })
    return () => {
      alive = false
    }
  }, [token, authStatus])

  useEffect(() => () => useWorkspace.getState().reset(), [token])

  if (state.status === 'loading')
    return (
      <div className="flex h-dvh items-center justify-center bg-paper">
        <Spinner size={28} />
      </div>
    )
  if (state.status !== 'ready')
    return (
      <main
        id="main"
        className="paper-dots flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center"
      >
        <Logo />
        <h1 className="text-2xl font-bold">{t(`link.${state.status}.title`)}</h1>
        <p className="max-w-md text-ink-muted">{t(`link.${state.status}.body`)}</p>
        <Link to="/" className={buttonClasses({})}>
          {t('link.goHome')}
        </Link>
      </main>
    )
  return (
    <ReactFlowProvider>
      <LinkMap token={token} view={state.view} />
    </ReactFlowProvider>
  )
}

function LinkMap({ token, view }: { token: string; view: LinkView }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const signedIn = useAuth((s) => s.status === 'signedIn')
  const nodes = useWorkspace((s) => s.nodes)
  const relations = useWorkspace((s) => s.relations)
  const selectedId = useWorkspace((s) => s.selectedId)
  const selectedRelationId = useWorkspace((s) => s.selectedRelationId)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [busy, setBusy] = useState<Pending | null>(null)
  const done = useRef(false)

  const onMap = view.role !== null
  const here = `/s/${token}`

  const signInFor = (what: Pending) =>
    navigate('/sign-in', { state: { from: `${here}?do=${what}` } })

  const act = async (what: Pending) => {
    if (!signedIn) return signInFor(what)
    if (what === 'report') return setReportOpen(true)
    setBusy(what)
    const res =
      what === 'join'
        ? await supabase.rpc('link_join', { p_token: token })
        : await supabase.rpc('copy_map', { p_token: token })
    setBusy(null)
    if (res.error) return toast(t(shareError(res.error)), 'danger')
    if (what === 'copy') toast(t('link.copied'), 'success')
    navigate(`/maps/${res.data}`)
  }

  // Back from sign-in: finish what the visitor started (once).
  const pending = params.get('do') as Pending | null
  useEffect(() => {
    if (!pending || !signedIn) return
    const id = setTimeout(() => {
      if (done.current) return
      done.current = true
      const next = new URLSearchParams(params)
      next.delete('do')
      setParams(next, { replace: true })
      if (pending === 'join' && view.access !== 'edit') return
      void act(pending)
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once after sign-in
  }, [pending, signedIn])

  const selectedNode = selectedId ? nodes[selectedId] : undefined
  const selectedRelation = selectedRelationId ? relations[selectedRelationId] : undefined
  const panelOpen = Boolean(selectedNode || selectedRelation)
  const close = () => {
    useWorkspace.getState().select(null)
    useWorkspace.getState().selectRelation(null)
  }

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <header className="z-20 flex min-h-[60px] shrink-0 flex-wrap items-center gap-2.5 border-b-2 border-line bg-surface px-3 py-2 sm:px-4">
        <IconButton
          label={t('ws.outline')}
          className="xl:hidden"
          aria-expanded={outlineOpen}
          onClick={() => setOutlineOpen((o) => !o)}
        >
          <PanelLeft size={19} className="rtl:-scale-x-100" />
        </IconButton>
        <Link to={signedIn ? '/home' : '/'} className="shrink-0 rounded-neo" aria-label="MyNota">
          <Logo withText={false} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 dir="auto" className="truncate text-base font-bold">
            {view.map.title}
          </h1>
          <p className="flex items-center gap-2 truncate text-xs text-ink-muted">
            {view.owner && (
              <span>{t('link.sharedBy', { name: `\u2068@${view.owner.username}\u2069` })}</span>
            )}
            <Badge tone={view.access === 'edit' ? 'brand' : 'neutral'}>
              {view.access === 'edit' ? t('share.roles.editor') : t('link.readOnly')}
            </Badge>
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <IconButton label={t('export.open')} onClick={() => setExportOpen(true)}>
            <Download size={18} aria-hidden />
          </IconButton>
          {!onMap && (
            <IconButton label={t('link.report')} onClick={() => void act('report')}>
              <Flag size={17} aria-hidden />
            </IconButton>
          )}
          {onMap ? (
            <Link to={`/maps/${view.map.id}`} className={buttonClasses({ size: 'sm' })}>
              <Network size={16} aria-hidden />
              {t('link.openMap')}
            </Link>
          ) : (
            <>
              <Button
                size="sm"
                variant={view.access === 'edit' ? 'secondary' : 'primary'}
                icon={<Copy size={16} aria-hidden />}
                loading={busy === 'copy'}
                onClick={() => void act('copy')}
              >
                {t('link.copy')}
              </Button>
              {view.access === 'edit' && (
                <Button
                  size="sm"
                  icon={
                    signedIn ? (
                      <PencilLine size={16} aria-hidden />
                    ) : (
                      <LogIn size={16} aria-hidden className="rtl:-scale-x-100" />
                    )
                  }
                  loading={busy === 'join'}
                  onClick={() => void act('join')}
                >
                  {signedIn ? t('link.join') : t('link.signInToEdit')}
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {!signedIn && (
        <p className="border-b-2 border-line bg-brand-soft px-4 py-2 text-center text-sm">
          {t('link.visitorNote')}{' '}
          <Link to="/sign-up" className="font-semibold underline">
            {t('link.signUp')}
          </Link>
        </p>
      )}

      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label={t('ws.outline')}
          className={cn(
            'z-30 w-[264px] shrink-0 border-e-2 border-line bg-surface-muted',
            'max-xl:absolute max-xl:inset-y-0 max-xl:start-0 max-xl:neo-shadow-lg max-xl:transition-transform',
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
            <StudyViewBanner />
          </div>
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2.5 px-3 [&>*]:pointer-events-auto',
              panelOpen && 'max-xl:pe-[min(372px,92vw)]',
            )}
          >
            <Toolbar />
          </div>
        </main>
        {panelOpen && (
          <aside
            aria-label={t('ws.panel.label')}
            className="z-30 w-[360px] max-w-[92vw] shrink-0 border-s-2 border-line bg-surface max-xl:absolute max-xl:inset-y-0 max-xl:end-0 max-xl:neo-shadow-lg"
          >
            {selectedNode ? (
              <NodePanel key={selectedNode.id} node={selectedNode} onClose={close} />
            ) : selectedRelation ? (
              <RelationPanel relation={selectedRelation} onClose={close} />
            ) : null}
          </aside>
        )}
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} target={{ token }} />
    </div>
  )
}
