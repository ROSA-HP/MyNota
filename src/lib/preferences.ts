import { z } from 'zod'

// Keep storage keys in sync with public/theme-init.js.
const THEME_KEY = 'mynota.theme'
const LANG_KEY = 'mynota.lang'

export const LANGUAGES = ['en', 'ar', 'de'] as const
export const LanguageSchema = z.enum(LANGUAGES)
export type Language = z.infer<typeof LanguageSchema>

export const THEMES = ['light', 'dark', 'system'] as const
export const ThemeSchema = z.enum(THEMES)
export type Theme = z.infer<typeof ThemeSchema>

export const isRtl = (lang: Language): boolean => lang === 'ar'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode): preference lasts for this tab only */
  }
}

export function getStoredTheme(): Theme {
  const parsed = ThemeSchema.safeParse(read(THEME_KEY))
  return parsed.success ? parsed.data : 'system'
}

export function getStoredLanguage(): Language | null {
  const parsed = LanguageSchema.safeParse(read(LANG_KEY))
  return parsed.success ? parsed.data : null
}

/** English is the default UI language; Arabic and German are opt-in via the switcher. */
export const DEFAULT_LANGUAGE: Language = 'en'

const darkQuery = (): MediaQueryList | null =>
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)')

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return darkQuery()?.matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  write(THEME_KEY, theme)
  document.documentElement.dataset.theme = resolveTheme(theme)
}

/** Re-applies the theme when the OS setting changes while "system" is selected. */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const query = darkQuery()
  if (!query) return () => undefined
  const onChange = () => {
    if (getTheme() === 'system') document.documentElement.dataset.theme = resolveTheme('system')
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function applyLanguage(lang: Language): void {
  write(LANG_KEY, lang)
  const root = document.documentElement
  root.lang = lang
  root.dir = isRtl(lang) ? 'rtl' : 'ltr'
}
