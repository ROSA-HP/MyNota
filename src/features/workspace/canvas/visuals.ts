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
import type { ChapterColor, NodeType, RelationRow } from '@/lib/database.types'

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
    tint: `color-mix(in srgb, var(--ch-${name}) var(--region-mix), transparent)`,
  }
}

/**
 * Link colors by meaning (canvas step 3): five families, so a glance tells "why are these
 * connected" without reading every label. The label always names the link too (never color
 * alone).
 */
export const RELATION_FAMILY: Record<
  RelationRow['type'],
  'cause' | 'structure' | 'contrast' | 'order' | 'loose'
> = {
  causes: 'cause',
  leads_to: 'cause',
  part_of: 'structure',
  example_of: 'structure',
  derived_from: 'structure',
  contrasts_with: 'contrast',
  prerequisite: 'order',
  analogy: 'loose',
  related: 'loose',
}

const FAMILY_COLOR = {
  cause: 'var(--ch-coral-strong)',
  structure: 'var(--ch-sky-strong)',
  contrast: 'var(--ch-pink-strong)',
  order: 'var(--ch-lavender-strong)',
  loose: 'var(--brand)',
} as const

/** Stroke color for a link (suggested links stay grey until accepted). */
export const relationColor = (r: Pick<RelationRow, 'type' | 'status'>): string =>
  r.status === 'suggested' ? 'var(--ink-muted)' : FAMILY_COLOR[RELATION_FAMILY[r.type]]
