import { useTranslation } from 'react-i18next'
import { chapterColor } from '@/features/workspace/canvas/visuals'
import { cn } from '@/lib/cn'
import type { ChapterColor, MapRow } from '@/lib/database.types'

/** Cover band color of a map card, by its cover color. */
export const COVER: Record<MapRow['cover_color'], string> = {
  yellow: 'bg-ch-yellow',
  coral: 'bg-ch-coral',
  sky: 'bg-ch-sky',
  mint: 'bg-ch-mint',
  lavender: 'bg-ch-lavender',
  pink: 'bg-ch-pink',
  orange: 'bg-ch-orange',
  lime: 'bg-ch-lime',
}

export const SubjectDot = ({ color, className }: { color: ChapterColor; className?: string }) => (
  <span
    aria-hidden
    className={cn(
      'inline-block size-3 shrink-0 rounded-full border-[1.5px] border-line',
      className,
    )}
    style={{ background: chapterColor(color).strong }}
  />
)

/** "updated today", "updated yesterday", else "updated Oct 26". */
export function useUpdated() {
  const { t, i18n } = useTranslation()
  return (iso: string) => {
    const d = new Date(iso)
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diff = Math.round((day(new Date()) - day(d)) / 86_400_000)
    const when =
      diff >= 0 && diff <= 1
        ? new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }).format(-diff, 'day')
        : new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(d)
    return t('library.updatedWhen', { when })
  }
}
