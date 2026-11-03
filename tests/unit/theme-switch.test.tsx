import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// The light/dark switch on every screen, and Shift+D (owner, 2026-11-03).
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})) as unknown as typeof window.matchMedia

await import('@/lib/i18n')
const { usePreferences } = await import('@/features/settings/preferencesStore')
const { ThemeButton, useThemeShortcut } = await import('@/features/settings/ThemeToggle')

function Screen() {
  useThemeShortcut()
  return (
    <>
      <ThemeButton />
      <input aria-label="Notes" />
    </>
  )
}

const theme = () => document.documentElement.dataset.theme
const shiftD = (target: Window | Element = window) =>
  act(() => {
    fireEvent.keyDown(target, { key: 'D', shiftKey: true, bubbles: true })
  })

afterEach(() => {
  cleanup()
  usePreferences.getState().setTheme('light')
})

describe('theme switch', () => {
  it('flips light and dark with one tap, and says where it goes', () => {
    usePreferences.getState().setTheme('light')
    render(<Screen />)
    const button = screen.getByRole('button', { name: /Switch to dark/ })
    fireEvent.click(button)
    expect(theme()).toBe('dark')
    expect(screen.getByRole('button', { name: /Switch to light/ })).toBeInTheDocument()
  })

  it('flips with Shift+D, but not while typing', () => {
    usePreferences.getState().setTheme('light')
    render(<Screen />)
    shiftD()
    expect(theme()).toBe('dark')
    shiftD(screen.getByRole('textbox', { name: 'Notes' }))
    expect(theme()).toBe('dark') // a capital D typed into a field
    shiftD()
    expect(theme()).toBe('light')
  })

  it('leaves "follow the system" for the opposite of what shows', () => {
    usePreferences.getState().setTheme('system') // the system is light in this test
    expect(usePreferences.getState().toggleTheme()).toBe('dark')
    expect(usePreferences.getState().theme).toBe('dark')
  })
})
