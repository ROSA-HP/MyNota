import { useEffect } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconButton, toast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { resolveTheme, type Theme } from '@/lib/preferences'
import { usePreferences } from './preferencesStore'

const OPTIONS: Array<{
  value: Theme
  Icon: typeof Sun
  key: 'common.themeLight' | 'common.themeDark' | 'common.themeSystem'
}> = [
  { value: 'light', Icon: Sun, key: 'common.themeLight' },
  { value: 'dark', Icon: Moon, key: 'common.themeDark' },
  { value: 'system', Icon: Monitor, key: 'common.themeSystem' },
]

/** Segmented control. `showLabels` for settings, icons only for headers. */
export function ThemeToggle({
  showLabels = false,
  className,
}: {
  showLabels?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const { theme, setTheme } = usePreferences()
  return (
    <div
      role="radiogroup"
      aria-label={t('common.theme')}
      className={cn(
        'inline-flex rounded-neo border-2 border-line bg-surface p-0.5 neo-shadow-sm',
        className,
      )}
    >
      {OPTIONS.map(({ value, Icon, key }) => {
        const selected = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={showLabels ? undefined : t(key)}
            title={t(key)}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] px-2 text-sm font-semibold transition-colors',
              selected ? 'bg-selected text-selected-ink' : 'text-ink hover:bg-paper-sunken',
              showLabels && 'px-3',
            )}
          >
            <Icon size={17} aria-hidden className={cn(selected && 'animate-pop')} />
            {showLabels && <span>{t(key)}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One-tap light ↔ dark switch for screens without the full header (the map, a study session,
 * a new map, a shared map). The icon shows where it goes: a moon in light mode, a sun in dark.
 */
export function ThemeButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const theme = usePreferences((s) => s.theme)
  const dark = resolveTheme(theme) === 'dark'
  return (
    <IconButton
      label={dark ? t('common.themeToLight') : t('common.themeToDark')}
      className={className}
      onClick={() => usePreferences.getState().toggleTheme()}
    >
      {/* Keyed, so the new icon pops in when the theme flips. */}
      {dark ? (
        <Sun key="sun" size={18} aria-hidden className="animate-pop" />
      ) : (
        <Moon key="moon" size={18} aria-hidden className="animate-pop" />
      )}
    </IconButton>
  )
}

/** Shift+D anywhere (except while typing) switches light and dark, with a short note. */
export function useThemeShortcut() {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'd') return
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      const next = usePreferences.getState().toggleTheme()
      toast(
        t('common.themeNow', {
          theme: next === 'dark' ? t('common.themeDark') : t('common.themeLight'),
        }),
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t])
}
