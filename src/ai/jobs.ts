import type { AiJobRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { scrubSecrets } from './errors'

type JobStart = Pick<AiJobRow, 'map_id' | 'pass' | 'provider' | 'model' | 'prompt_version'> &
  Partial<Pick<AiJobRow, 'chapter_node_id' | 'node_id'>>

/**
 * Records one AI request in ai_jobs (for the admin dashboard and prompt-version stats).
 * Logging never blocks or breaks the map: failures are ignored. Never includes the key.
 */
export async function startJob(job: JobStart): Promise<string | null> {
  const id = crypto.randomUUID()
  const { error } = await supabase.from('ai_jobs').insert({ ...job, id, status: 'running' })
  return error ? null : id
}

export async function finishJob(
  id: string | null,
  result: {
    status: 'done' | 'failed'
    tokensIn?: number
    tokensOut?: number
    durationMs: number
    error?: string
  },
): Promise<void> {
  if (!id) return
  await supabase
    .from('ai_jobs')
    .update({
      status: result.status,
      tokens_in: result.tokensIn ?? null,
      tokens_out: result.tokensOut ?? null,
      duration_ms: Math.round(result.durationMs),
      error: result.error ? scrubSecrets(result.error).slice(0, 1000) : null,
    })
    .eq('id', id)
}
