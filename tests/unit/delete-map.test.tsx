import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// Stub HTMLDialogElement.showModal / close in jsdom before rendering LibraryPage.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
  }
})

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia

await import('@/lib/i18n')
const { createLocalSupabaseClient } = await import('@/lib/localSupabase')
const { useAuth } = await import('@/features/auth/authStore')

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MAP_1 = '11111111-1111-4111-8111-111111111111'
const MAP_2 = '22222222-2222-4222-8222-222222222222'
const MAP_SHARED = '33333333-3333-4333-8333-333333333333'
const NODE_1 = '44444444-4444-4444-8444-444444444444'
const NODE_2 = '55555555-5555-4555-8555-555555555555'

function seedLocalDb() {
  const now = new Date().toISOString()
  localStorage.setItem(
    'mynota.local.db.v1',
    JSON.stringify({
      sessionUserId: USER_ID,
      accounts: [{ id: USER_ID, email: 'test@example.com', password: 'pw' }],
      profiles: [
        {
          id: USER_ID,
          username: 'tester',
          name: 'Tester',
          avatar_url: null,
          role: 'student',
          status: 'active',
          two_factor_enabled: false,
          ui_language: 'en',
          theme: 'light',
          daily_new_limit: 10,
          daily_review_limit: 100,
          created_at: now,
          updated_at: now,
        },
      ],
      subjects: [],
      maps: [
        {
          id: MAP_1,
          owner_id: USER_ID,
          subject_id: null,
          title: 'Unwanted Map',
          type: 'notes',
          cover_color: 'yellow',
          languages: ['en'],
          link_access: 'off',
          link_expires_at: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: MAP_2,
          owner_id: USER_ID,
          subject_id: null,
          title: 'Keeper Map',
          type: 'notes',
          cover_color: 'mint',
          languages: ['en'],
          link_access: 'off',
          link_expires_at: null,
          created_at: now,
          updated_at: now,
        },
        {
          id: MAP_SHARED,
          owner_id: OTHER_USER,
          subject_id: null,
          title: 'Shared Map',
          type: 'notes',
          cover_color: 'sky',
          languages: ['en'],
          link_access: 'off',
          link_expires_at: null,
          created_at: now,
          updated_at: now,
        },
      ],
      nodes: [
        {
          id: NODE_1,
          map_id: MAP_1,
          parent_id: null,
          sort_order: 0,
          level: 'chapter',
          title: 'Ch 1',
          summary: '',
          type: 'concept',
          icon: 'book',
          color: 'yellow',
          importance: 'core',
          details: [],
          lang: 'en',
          dir: 'ltr',
          branch_view: 'diagram',
          position: { x: 0, y: 0 },
          size: { w: 240, h: 120 },
          collapsed: false,
          source: null,
          ai_added: false,
          ai_added_reason: null,
          origin: 'user',
          created_by: USER_ID,
          created_at: now,
          updated_at: now,
        },
        {
          id: NODE_2,
          map_id: MAP_2,
          parent_id: null,
          sort_order: 0,
          level: 'chapter',
          title: 'Ch Keep',
          summary: '',
          type: 'concept',
          icon: 'book',
          color: 'mint',
          importance: 'core',
          details: [],
          lang: 'en',
          dir: 'ltr',
          branch_view: 'diagram',
          position: { x: 0, y: 0 },
          size: { w: 240, h: 120 },
          collapsed: false,
          source: null,
          ai_added: false,
          ai_added_reason: null,
          origin: 'user',
          created_by: USER_ID,
          created_at: now,
          updated_at: now,
        },
      ],
      relations: [],
      sources: [],
      cards: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          map_id: MAP_1,
          node_id: NODE_1,
          type: 'qa',
          front: 'Q1',
          back: 'A1',
          suspended: false,
          origin: 'user',
          created_by: USER_ID,
          created_at: now,
          updated_at: now,
        },
      ],
      card_progress: [],
      review_logs: [],
      ai_jobs: [],
      map_members: [],
      login_events: [],
      app_settings: [],
      docs: [
        {
          doc_key: 'main',
          map_id: MAP_1,
          state: null,
          updates: ['abc'],
          upto: 1,
        },
      ],
    }),
  )
}

describe('deleting unwanted maps', () => {
  beforeEach(() => {
    localStorage.clear()
    seedLocalDb()
    useAuth.setState({
      session: {
        user: { id: USER_ID },
      } as never,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('cascade-deletes map child data in localSupabase without touching other maps', async () => {
    const client = createLocalSupabaseClient()
    const { error } = await client.from('maps').delete().eq('id', MAP_1)
    expect(error).toBeNull()

    const raw = JSON.parse(localStorage.getItem('mynota.local.db.v1') || '{}') as {
      maps: Array<{ id: string }>
      nodes: Array<{ map_id: string }>
      cards: Array<{ map_id: string }>
      docs: Array<{ map_id: string }>
    }
    expect(raw.maps.map((m) => m.id)).toEqual([MAP_2, MAP_SHARED])
    expect(raw.nodes.map((n) => n.map_id)).toEqual([MAP_2])
    expect(raw.cards).toEqual([])
    expect(raw.docs).toEqual([])
  })

  it('allows deleting owned maps from the Library card menu with confirmation', async () => {
    const { LibraryPage } = await import('@/features/library/LibraryPage')

    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Unwanted Map')).toBeInTheDocument()
    expect(screen.getByText('Keeper Map')).toBeInTheDocument()

    // Shared maps must not expose owner Delete map option
    fireEvent.click(screen.getByRole('button', { name: 'Options for Shared Map' }))
    expect(screen.queryByRole('menuitem', { name: 'Delete map' })).toBeNull()

    // Open owned map menu -> click Delete map -> Cancel preserves the map
    fireEvent.click(screen.getByRole('button', { name: 'Options for Unwanted Map' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete map' }))
    expect(screen.getByRole('heading', { name: 'Delete “Unwanted Map”?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Unwanted Map')).toBeInTheDocument()

    // Open menu again -> Delete map -> confirm deletion
    fireEvent.click(screen.getByRole('button', { name: 'Options for Unwanted Map' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete map' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete map' }))

    await waitFor(() => {
      expect(screen.queryByText('Unwanted Map')).toBeNull()
    })
    expect(screen.getByText('Keeper Map')).toBeInTheDocument()
  })
})
