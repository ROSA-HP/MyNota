import { z } from 'zod'

export const NODE_TYPES = [
  'definition',
  'concept',
  'process_step',
  'event',
  'person',
  'formula',
  'example',
  'comparison',
  'key_fact',
  'warning',
  'vocabulary',
] as const
export const NodeTypeSchema = z.enum(NODE_TYPES)

export const IMPORTANCE = ['core', 'supporting', 'extra'] as const
export const ImportanceSchema = z.enum(IMPORTANCE)

export const BRANCH_SHAPES = ['tree', 'process', 'timeline', 'comparison', 'cause_effect'] as const
export const BranchShapeSchema = z.enum(BRANCH_SHAPES)

export const RELATION_TYPES = [
  'causes',
  'leads_to',
  'part_of',
  'example_of',
  'contrasts_with',
  'prerequisite',
  'analogy',
  'derived_from',
  'related',
] as const
export const RelationTypeSchema = z.enum(RELATION_TYPES)

export const DETAIL_KINDS = [
  'text',
  'bullet',
  'example',
  'vocab',
  'formula',
  'question',
  'cloze',
] as const
export const DetailKindSchema = z.enum(DETAIL_KINDS)

/** Hard limits. The softer "2–6 words / 15 words" style rules live in rules.ts as warnings. */
export const LIMITS = {
  titleChars: 80,
  summaryChars: 200,
  detailChars: 600,
  relationLabelChars: 40,
  maxChildren: 7,
  maxSections: 7,
  maxSubsections: 7,
  maxBlocksPerSection: 40,
  maxDetailsPerBlock: 12,
} as const

export const titleSchema = z.string().trim().min(1).max(LIMITS.titleChars)
export const summarySchema = z.string().trim().max(LIMITS.summaryChars)

/** Paragraph numbers are 1-based (P1 is 1). */
export const paragraphNumber = z.number().int().min(1)
