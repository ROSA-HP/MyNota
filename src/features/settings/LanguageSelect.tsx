import { Languages, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LANGUAGE_NAMES } from '@/lib/i18n'
import { LANGUAGES, LanguageSchema } from '@/lib/preferences'
import { cn } from '@/lib/cn'
import { usePreferences } from './preferencesStore'

/** Compact language picker for headers. Each option is labeled in its own language. */
export function LanguageSelect({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { language, setLanguage } = usePreferences()
  return (
    <label
      className={cn(
        'neo-btn relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-neo border-2 border-line bg-surface ps-3 pe-8 text-sm font-semibold text-ink neo-shadow-sm hover:bg-surface-muted',
        className,
      )}
    >
      <Languages size={18} aria-hidden />
      <span className="sr-only">{t('common.language')}</span>
      <span aria-hidden>{LANGUAGE_NAMES[language]}</span>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-2.5" />
      <select
        value={language}
        onChange={(e) => {
          const parsed = LanguageSchema.safeParse(e.target.value)
          if (parsed.success) setLanguage(parsed.data)
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANGUAGE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
