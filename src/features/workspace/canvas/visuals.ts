import {
  BookOpen,
  CalendarDays,
  Columns2,
  FlaskConical,
  Languages,
  Lightbulb,
  ListOrdered,
  Sigma,
  Star,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react'
import type { ChapterColor, NodeType } from '@/lib/database.types'

/** Node type → icon badge (docs/design-system.md › Node types → icons). */
export const TYPE_ICON: Record<NodeType, LucideIcon> = {
  definition: BookOpen,
  concept: Lightbulb,
  process_step: ListOrdered,
  event: CalendarDays,
  person: User,
  formula: Sigma,
  example: FlaskConical,
  comparison: Columns2,
  key_fact: Star,
  warning: TriangleAlert,
  vocabulary: Languages,
}

/** Chapter color = region tint + node border (design-system color rule). */
export const chapterColor = (c: ChapterColor | null | undefined) => {
  const name = c ?? 'yellow'
  return {
    fill: `var(--ch-${name})`,
    strong: `var(--ch-${name}-strong)`,
    tint: `color-mix(in srgb, var(--ch-${name}) 42%, transparent)`,
  }
}
