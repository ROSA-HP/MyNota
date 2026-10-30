import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { ar } from '@/locales/ar'
import { de } from '@/locales/de'
import { en } from '@/locales/en'
import { DEFAULT_LANGUAGE, applyLanguage, getStoredLanguage, type Language } from './preferences'

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  ar: 'العربية',
  de: 'Deutsch',
}

const initial = getStoredLanguage() ?? DEFAULT_LANGUAGE
applyLanguage(initial)

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    de: { translation: de },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes output already.
  returnNull: false,
})

export async function setLanguage(lang: Language): Promise<void> {
  applyLanguage(lang)
  await i18n.changeLanguage(lang)
}

export function currentLanguage(): Language {
  const lng = i18n.resolvedLanguage
  return lng === 'ar' || lng === 'de' ? lng : 'en'
}

export default i18n
