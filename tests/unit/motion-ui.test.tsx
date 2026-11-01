import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// Motion pass (2026-11-01): the live build progress and numbers that count up.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))

// jsdom has no matchMedia (motion and theme code ask for system preferences).
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia

await import('@/lib/i18n')
const { useBuild } = await import('@/features/workspace/buildStore')
const { BuildBanner } = await import('@/features/workspace/BuildBanner')
const { CountUp } = await import('@/components/ui/CountUp')

afterEach(cleanup)

describe('build banner', () => {
  it('shows one square per section, filled as sections finish', () => {
    useBuild.setState({
      phase: 'details',
      outlineStatus: { state: 'done' },
      order: ['a', 'b', 'c', 'd'],
      sections: {
        a: { state: 'done' },
        b: { state: 'running' },
        c: { state: 'failed', kind: 'network' },
        d: { state: 'queued' },
      },
      chapters: {},
      chapterOrder: [],
      currentChapter: null,
    })
    const { container } = render(
      <MemoryRouter>
        <BuildBanner />
      </MemoryRouter>,
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    const squares = container.querySelectorAll('.size-3')
    expect(squares).toHaveLength(4)
    expect(squares[0]).toHaveClass('bg-brand', 'animate-pop')
    expect(squares[1]).toHaveClass('mynota-breathe')
    expect(squares[2]).toHaveClass('bg-danger')
    expect(squares[3]).toHaveClass('bg-paper-sunken')
  })
})

describe('count up', () => {
  it('ends on the value and tells screen readers only the value', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })
    const { container } = render(<CountUp value={42} ms={300} />)
    expect(container.querySelector('.sr-only')).toHaveTextContent('42')
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(container.querySelector('[aria-hidden]')).toHaveTextContent('42')
    vi.useRealTimers()
  })
})
