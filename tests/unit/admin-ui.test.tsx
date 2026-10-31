import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ProfileRow } from '@/lib/database.types'

// The admin area (Phase 7.3): who gets in, and that a page shows what the database returns.
const calls: Array<[string, unknown]> = []
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      calls.push([fn, args])
      if (fn === 'admin_overview')
        return Promise.resolve({
          data: {
            users: 1234,
            active_7d: 56,
            studying_7d: 40,
            suspended: 2,
            maps: 300,
            maps_7d: 12,
            blocks: 9000,
            reviews_7d: 777,
            public_links: 5,
            open_reports: 3,
            source_bytes: 3 * 1024 * 1024,
            signups: [{ day: '2026-10-30', count: 4 }],
          },
          error: null,
        })
      return Promise.resolve({ data: null, error: { message: 'admins only', code: '42501' } })
    },
    auth: {},
  },
}))

// jsdom has no matchMedia (the theme code asks for the system color scheme).
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia

await import('@/lib/i18n')
const { useAuth } = await import('@/features/auth/authStore')
const { AdminLayout } = await import('@/features/admin/AdminLayout')
const { OverviewPage, AuditPage } = await import('@/features/admin/SimplePages')

const profile = (role: 'student' | 'admin') =>
  ({ id: 'u1', role, status: 'active', username: 'boss', name: 'Boss' }) as ProfileRow

function show(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  calls.length = 0
})

describe('admin area', () => {
  it('is closed to students', () => {
    useAuth.setState({ profile: profile('student'), mfaVerified: true })
    show()
    expect(screen.getByText('This area is for MyNota admins only.')).toBeInTheDocument()
  })

  it('asks admins without a two-factor session to set it up', () => {
    useAuth.setState({ profile: profile('admin'), mfaVerified: false })
    show()
    expect(screen.getByText(/needs two-factor sign-in/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Security settings' })).toHaveAttribute(
      'href',
      '/settings#security',
    )
    expect(calls).toHaveLength(0) // nothing was asked of the database
  })

  it('shows the overview to verified admins', async () => {
    useAuth.setState({ profile: profile('admin'), mfaVerified: true })
    show()
    expect(await screen.findByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('3 MB')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open reports/ })).toHaveAttribute(
      'href',
      '/admin/reports',
    )
    expect(calls.map((c) => c[0])).toEqual(['admin_overview'])
  })

  it('shows the database’s refusal instead of an empty page', async () => {
    useAuth.setState({ profile: profile('admin'), mfaVerified: true })
    show('/admin/audit')
    expect(await screen.findByText(/admins only/)).toBeInTheDocument()
  })
})
