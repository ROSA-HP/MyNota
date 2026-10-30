import { beforeEach, describe, expect, it } from 'vitest'
import { applyLanguage, applyTheme, getStoredLanguage, getStoredTheme } from '@/lib/preferences'

describe('preferences', () => {
  beforeEach(() => localStorage.clear())

  it('sets dir="rtl" only for Arabic', () => {
    applyLanguage('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    applyLanguage('de')
    expect(document.documentElement.dir).toBe('ltr')
    expect(getStoredLanguage()).toBe('de')
  })

  it('ignores unknown stored values', () => {
    localStorage.setItem('mynota.lang', 'fr')
    localStorage.setItem('mynota.theme', 'neon')
    expect(getStoredLanguage()).toBeNull()
    expect(getStoredTheme()).toBe('system')
  })

  it('applies an explicit theme to <html>', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(getStoredTheme()).toBe('dark')
  })
})

describe('default language', () => {
  it('is English when nothing is stored, whatever the browser language', async () => {
    localStorage.clear()
    const { DEFAULT_LANGUAGE } = await import('@/lib/preferences')
    expect(DEFAULT_LANGUAGE).toBe('en')
    expect(getStoredLanguage()).toBeNull()
  })
})
