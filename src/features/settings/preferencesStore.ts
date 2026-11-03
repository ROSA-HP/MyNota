import { create } from 'zustand'
import i18n, { currentLanguage, setLanguage as applyI18nLanguage } from '@/lib/i18n'
import type { ProfileRow } from '@/lib/database.types'
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  watchSystemTheme,
  type Language,
  type Theme,
} from '@/lib/preferences'
import { supabase } from '@/lib/supabase'

interface PreferencesState {
  theme: Theme
  language: Language
  setTheme: (theme: Theme) => void
  /** Light ↔ dark from whatever is showing now (also leaves "system"). */
  toggleTheme: () => 'light' | 'dark'
  setLanguage: (language: Language) => void
  /** On sign-in the account's saved preferences win over this device's. */
  adoptFromProfile: (profile: Pick<ProfileRow, 'theme' | 'ui_language'>) => void
}

/** Saves the preference to the signed-in user's profile. Failures are non-fatal. */
async function syncToProfile(patch: { theme?: Theme; ui_language?: Language }): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) console.warn('Could not save preference to profile', error.code)
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  theme: getStoredTheme(),
  language: currentLanguage(),

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
    void syncToProfile({ theme })
  },

  toggleTheme: () => {
    const next = resolveTheme(get().theme) === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
    return next
  },

  setLanguage: (language) => {
    void applyI18nLanguage(language)
    set({ language })
    void syncToProfile({ ui_language: language })
  },

  adoptFromProfile: (profile) => {
    if (profile.theme !== get().theme) {
      applyTheme(profile.theme)
      set({ theme: profile.theme })
    }
    if (profile.ui_language !== get().language) {
      void applyI18nLanguage(profile.ui_language)
      set({ language: profile.ui_language })
    }
  },
}))

applyTheme(usePreferences.getState().theme)
watchSystemTheme(() => usePreferences.getState().theme)
i18n.on('languageChanged', () => {
  const language = currentLanguage()
  if (usePreferences.getState().language !== language) usePreferences.setState({ language })
})
