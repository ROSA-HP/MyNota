import { useEffect, useState } from 'react'
import { BookOpen, House, Layers, LogOut, Menu, Settings, WifiOff, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Badge, IconButton, Logo } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { SearchPalette, SearchButton } from '@/features/search/SearchPalette'
import { useInvites } from '@/features/sharing/invitesStore'
import { useOverview } from '@/features/study/overviewStore'
import { LanguageSelect } from '@/features/settings/LanguageSelect'
import { ThemeToggle } from '@/features/settings/ThemeToggle'
import { cn } from '@/lib/cn'
import { Avatar } from './Avatar'
import { useOnline } from './useOnline'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-h-11 items-center gap-3 rounded-neo border-2 px-3 text-[15px] font-semibold transition-colors',
    isActive
      ? 'border-line bg-surface font-bold text-ink'
      : 'border-transparent text-ink hover:bg-paper-sunken',
  )

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const profile = useAuth((s) => s.profile)
  const signOut = useAuth((s) => s.signOut)
  const invites = useInvites((s) => s.invites.length)
  const due = useOverview((s) =>
    s.data ? Object.values(s.data.decks).reduce((n, d) => n + d.due, 0) : 0,
  )

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <nav aria-label={t('nav.main')} className="flex flex-col gap-1.5">
        <NavLink to="/home" className={navLinkClass} onClick={onNavigate}>
          <House size={20} aria-hidden />
          {t('nav.home')}
        </NavLink>
        <NavLink to="/library" className={navLinkClass} onClick={onNavigate}>
          <BookOpen size={20} aria-hidden />
          {t('nav.library')}
          {invites > 0 && (
            <Badge
              tone="warning"
              className="ms-auto"
              aria-label={t('invites.title', { count: invites })}
            >
              {invites}
            </Badge>
          )}
        </NavLink>
        <NavLink to="/flashcards" className={navLinkClass} onClick={onNavigate}>
          <Layers size={20} aria-hidden />
          {t('nav.flashcards')}
          {due > 0 && (
            <Badge tone="brand" className="ms-auto" aria-label={t('nav.due', { count: due })}>
              {due}
            </Badge>
          )}
        </NavLink>
        <NavLink to="/settings" className={navLinkClass} onClick={onNavigate}>
          <Settings size={20} aria-hidden />
          {t('nav.settings')}
        </NavLink>
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t-2 border-line-soft pt-3">
        {profile && (
          <Link
            to="/settings"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-neo p-1.5 hover:bg-paper-sunken"
          >
            <Avatar name={profile.name} username={profile.username} url={profile.avatar_url} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">
                {profile.name || profile.username}
              </span>
              <span className="block truncate text-xs text-ink-muted" dir="ltr">
                @{profile.username}
              </span>
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-neo px-3 text-[15px] font-semibold text-ink hover:bg-paper-sunken"
        >
          <LogOut size={20} aria-hidden className="rtl:-scale-x-100" />
          {t('common.signOut')}
        </button>
      </div>
    </div>
  )
}

/**
 * Signed-in layout. Desktop (lg+): sidebar docked. Tablet and below: the sidebar is a drawer
 * opened by tapping the menu button (no hover-to-open, per the brief).
 */
export function AppShell() {
  const { t } = useTranslation()
  const online = useOnline()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const userId = useAuth((s) => s.session?.user.id)
  const { pathname } = useLocation()

  // Keeps the Flashcards badge current as the student moves around (at most every 30 s).
  useEffect(() => {
    if (!userId) return
    void useOverview.getState().load(userId, 30_000)
    void useInvites.getState().load(30_000)
  }, [userId, pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-neo focus:border-2 focus:border-line focus:bg-surface focus:px-3 focus:py-2"
      >
        {t('common.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b-2 border-line bg-surface px-3 sm:px-5">
        <IconButton
          label={drawerOpen ? t('common.closeMenu') : t('common.openMenu')}
          aria-expanded={drawerOpen}
          aria-controls="app-drawer"
          className="lg:hidden"
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <Menu size={20} />
        </IconButton>
        <Link to="/home" className="rounded-neo">
          <Logo />
        </Link>
        <div className="ms-4 hidden flex-1 md:block">
          <SearchButton />
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="md:hidden">
            <SearchButton compact />
          </span>
          <ThemeToggle className="hidden sm:inline-flex" />
          <LanguageSelect />
        </div>
      </header>

      {!online && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 border-b-2 border-line bg-warning-soft px-4 py-2 text-sm font-semibold text-ink"
        >
          <WifiOff size={16} aria-hidden />
          {t('common.offline')}
        </div>
      )}

      <div className="flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 border-e-2 border-line bg-surface-muted lg:block">
          <SidebarContent />
        </aside>

        {/* Drawer (tablet / phone) */}
        <div
          className={cn(
            'fixed inset-0 z-40 bg-[#121c1b]/55 transition-opacity lg:hidden',
            drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
        <aside
          id="app-drawer"
          aria-label={t('nav.main')}
          inert={!drawerOpen}
          className={cn(
            'fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] border-e-2 border-line bg-surface-muted neo-shadow-lg transition-transform duration-200 lg:hidden',
            drawerOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between border-b-2 border-line px-3">
            <Logo />
            <IconButton label={t('common.closeMenu')} onClick={() => setDrawerOpen(false)}>
              <X size={20} />
            </IconButton>
          </div>
          <div className="h-[calc(100%-4rem)]">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          <Outlet />
        </main>
        <SearchPalette />
      </div>
    </div>
  )
}
