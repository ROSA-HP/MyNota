import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import type { Theme } from '@/lib/preferences'
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
