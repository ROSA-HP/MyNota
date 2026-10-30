import { AiError, isAbortError } from './errors'

export interface QueueEvents {
  /** A task is paused until `until` (epoch ms) because the provider asked us to slow down. */
  onWait?: (taskId: string, until: number) => void
  onStart?: (taskId: string) => void
}

export interface QueueOptions extends QueueEvents {
  concurrency: number
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Injected for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  random?: () => number
  now?: () => number
}

export const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

/**
 * Client-side request queue (docs/ai-pipeline.md): limits parallel calls and retries
 * rate-limit (429), overload (5xx) and network errors with exponential backoff and jitter,
 * honouring the provider's Retry-After when given. Free AI Studio keys hit limits often.
 */
export class AiQueue {
  private running = 0
  private readonly waiting: Array<() => void> = []
  private readonly opts: Required<Omit<QueueOptions, keyof QueueEvents>> & QueueEvents

  constructor(opts: QueueOptions) {
    this.opts = {
      maxRetries: 5,
      baseDelayMs: 2000,
      maxDelayMs: 60000,
      sleep: defaultSleep,
      random: Math.random,
      now: Date.now,
      ...opts,
    }
  }

  backoffMs(attempt: number, error: AiError): number {
    if (error.retryAfterMs !== undefined)
      return Math.min(error.retryAfterMs + 250, this.opts.maxDelayMs * 2)
    const exp = this.opts.baseDelayMs * 2 ** attempt
    const jitter = 0.75 + this.opts.random() * 0.5
    return Math.min(Math.round(exp * jitter), this.opts.maxDelayMs)
  }

  private async acquire(signal?: AbortSignal): Promise<void> {
    if (this.running < this.opts.concurrency) {
      this.running++
      return
    }
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener('abort', onAbort)
        this.running++
        resolve()
      }
      const onAbort = () => {
        const i = this.waiting.indexOf(go)
        if (i >= 0) this.waiting.splice(i, 1)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.waiting.push(go)
    })
  }

  private release(): void {
    this.running--
    this.waiting.shift()?.()
  }

  async run<T>(taskId: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal)
    try {
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        this.opts.onStart?.(taskId)
        try {
          return await fn()
        } catch (e) {
          if (isAbortError(e)) throw e
          if (!(e instanceof AiError) || !e.retryable || attempt >= this.opts.maxRetries) throw e
          const delay = this.backoffMs(attempt, e)
          this.opts.onWait?.(taskId, this.opts.now() + delay)
          await this.opts.sleep(delay, signal)
        }
      }
    } finally {
      this.release()
    }
  }
}
