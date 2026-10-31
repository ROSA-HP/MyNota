import { createBrowserRouter } from 'react-router'
import { AdminLayout } from '@/features/admin/AdminLayout'
import { LoginsPage, MapsPage, ReportsPage, SharingPage } from '@/features/admin/ModerationPages'
import { AiJobsPage, AuditPage, OverviewPage, SystemPage } from '@/features/admin/SimplePages'
import { UserDetailPage, UsersPage } from '@/features/admin/UsersPages'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'
import { CheckEmailPage } from '@/features/auth/CheckEmailPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { SignInPage } from '@/features/auth/SignInPage'
import { SignUpPage } from '@/features/auth/SignUpPage'
import { FlashcardsPage } from '@/features/flashcards/FlashcardsPage'
import { HomePage } from '@/features/home/HomePage'
import { LandingPage } from '@/features/landing/LandingPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { NewMapPage } from '@/features/new-map/NewMapPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { LinkPage } from '@/features/sharing/LinkPage'
import { DeckPage } from '@/features/study/deck/DeckPage'
import { StudyPage } from '@/features/study/StudyPage'
import { WorkspacePage } from '@/features/workspace/WorkspacePage'
import { AppShell } from './AppShell'
import { RedirectIfAuthed, RequireAuth } from './guards'
import { NotFoundPage } from './NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RedirectIfAuthed>
        <LandingPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/sign-in',
    element: (
      <RedirectIfAuthed>
        <SignInPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/sign-up',
    element: (
      <RedirectIfAuthed>
        <SignUpPage />
      </RedirectIfAuthed>
    ),
  },
  { path: '/check-email', element: <CheckEmailPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  // A map shared by link: open to everyone (read only); signing in unlocks join / copy / report.
  { path: '/s/:token', element: <LinkPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/home', element: <HomePage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/flashcards', element: <FlashcardsPage /> },
      { path: '/maps/:mapId/deck', element: <DeckPage /> },
      { path: '/settings', element: <SettingsPage /> },
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'users/:userId', element: <UserDetailPage /> },
          { path: 'maps', element: <MapsPage /> },
          { path: 'sharing', element: <SharingPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'logins', element: <LoginsPage /> },
          { path: 'ai', element: <AiJobsPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'system', element: <SystemPage /> },
        ],
      },
    ],
  },
  {
    path: '/new',
    element: (
      <RequireAuth>
        <NewMapPage />
      </RequireAuth>
    ),
  },
  {
    path: '/maps/:mapId',
    element: (
      <RequireAuth>
        <WorkspacePage />
      </RequireAuth>
    ),
  },
  {
    path: '/maps/:mapId/study',
    element: (
      <RequireAuth>
        <StudyPage />
      </RequireAuth>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
])
