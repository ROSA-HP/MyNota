import { createBrowserRouter } from 'react-router'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'
import { CheckEmailPage } from '@/features/auth/CheckEmailPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { SignInPage } from '@/features/auth/SignInPage'
import { SignUpPage } from '@/features/auth/SignUpPage'
import { LandingPage } from '@/features/landing/LandingPage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { NewMapPage } from '@/features/new-map/NewMapPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
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
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/library', element: <LibraryPage /> },
      { path: '/settings', element: <SettingsPage /> },
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
  { path: '*', element: <NotFoundPage /> },
])
