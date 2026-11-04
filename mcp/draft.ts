import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DetailsResponse } from '../src/ai/schemas/details'
import type { OutlineResponse } from '../src/ai/schemas/outline'
import { dataDir } from './config'
import type { SectionReport } from './check'
import type { LoadedSource, SourceChapter } from './source'

/**
 * A map being built, as a file on this computer. Every saved outline and section goes here at
 * once, so a plan limit or a closed chat in the middle of a book loses nothing: the next chat
 * picks it up. Nothing reaches the database until `publish_map`.
 */

export interface CrossLink {
  from: string
  to: string
  type: DetailsResponse['relations'][number]['type']
  label: string
  confidence: 'high' | 'medium'
}

export interface DraftSection {
  answer: DetailsResponse
  report: SectionReport
  /** How many times this section has been saved (the fix-and-check rounds). */
  rounds: number
}

export interface DraftChapter extends SourceChapter {
  outline: OutlineResponse | null
  /** One entry per outline section, in order; null until that section is saved. */
  sections: Array<DraftSection | null>
  /** Links between sections of this chapter (they appear as suggestions in the app). */
  links: CrossLink[]
}

export interface Draft {
  id: string
  title: string
  mapType: 'book' | 'notes'
  mode: 'textbook' | 'notes'
  detail: 'brief' | 'standard' | 'detailed'
  language: string | null
  explanationLanguage: string | null
  source: Pick<LoadedSource, 'kind' | 'file' | 'pageCount' | 'pagesWithoutText'>
  chapters: DraftChapter[]
  /** Links between chapters of a book. */
  bookLinks: CrossLink[]
  createdAt: string
  updatedAt: string
  /** Set once the map is in the database; a draft is published only once. */
  publishedMapId: string | null
}

const VALID_ID = /^d_[0-9a-f]{12}$/
const draftsDir = () => join(dataDir(), 'drafts')
const fileOf = (id: string) => join(draftsDir(), `${id}.json`)
const planOf = (id: string) => join(draftsDir(), `${id}.publish.json`)

export class DraftError extends Error {}

export function newDraftId(): string {
  return `d_${randomBytes(6).toString('hex')}`
}

/** Written beside the real file and then swapped in, so a crash cannot leave half a draft. */
function writeJson(path: string, value: unknown): void {
  mkdirSync(draftsDir(), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value))
  renameSync(tmp, path)
}

export function saveDraft(draft: Draft): void {
  writeJson(fileOf(draft.id), { ...draft, updatedAt: new Date().toISOString() })
}

export function loadDraft(id: string): Draft {
  // The id comes from the AI and becomes a file name, so it must be exactly our format.
  if (!VALID_ID.test(id)) throw new DraftError(`"${id}" is not a draft id.`)
  try {
    return JSON.parse(readFileSync(fileOf(id), 'utf8')) as Draft
  } catch {
    throw new DraftError(`There is no draft ${id}. map_status lists the drafts on this computer.`)
  }
}

export function listDrafts(): Draft[] {
  let names: string[]
  try {
    names = readdirSync(draftsDir())
  } catch {
    return []
  }
  return names
    .filter((n) => VALID_ID.test(n.replace(/\.json$/, '')))
    .map((n) => loadDraft(n.replace(/\.json$/, '')))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function savePlan(id: string, plan: unknown): void {
  writeJson(planOf(id), plan)
}

export function loadPlan<T>(id: string): T | null {
  try {
    return JSON.parse(readFileSync(planOf(id), 'utf8')) as T
  } catch {
    return null
  }
}

export function deletePlan(id: string): void {
  rmSync(planOf(id), { force: true })
}
