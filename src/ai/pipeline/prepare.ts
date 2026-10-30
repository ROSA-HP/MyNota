import type { Paragraph } from '../prompts/shared'

export const MAX_PASTE_CHARS = 150_000
const MAX_PARAGRAPH_CHARS = 1500
const TARGET_PIECE_CHARS = 1000
const BULLET = /^\s*([-*•–·▪◦]|\d+[.)]|[a-z][.)])\s+/i

/**
 * Splits pasted text into numbered paragraphs P1..Pn (docs/ai-pipeline.md › Preparation).
 * Blank lines separate paragraphs. Text with no blank lines at all (typical copied lecture
 * notes) is split per line instead. Very long paragraphs are cut at sentence ends.
 */
export function splitParagraphs(raw: string): Paragraph[] {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B\u200C\uFEFF]/g, '') // zero-width chars (keep ZWJ U+200D for scripts that need it)
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  if (!text) return []

  let units = text.split(/\n\s*\n+/)
  if (units.length === 1 && text.includes('\n')) units = packLines(text.split('\n'))

  const pieces: string[] = []
  for (const unit of units) {
    const clean = unit
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
    if (!clean) continue
    if (clean.length <= MAX_PARAGRAPH_CHARS) pieces.push(clean)
    else pieces.push(...splitLong(clean))
  }
  return pieces.map((t, i) => ({ n: i + 1, text: t }))
}

/** For text without blank lines: headings stand alone, bullet runs and prose lines are packed. */
function packLines(lines: string[]): string[] {
  const out: string[] = []
  let cur: string[] = []
  const flush = () => {
    if (cur.length) out.push(cur.join('\n'))
    cur = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const isHeading =
      line.length <= 60 &&
      !BULLET.test(line) &&
      !/[.,;:!?؟،]$/.test(line) &&
      /^[\p{Lu}\p{Lo}\d#]/u.test(line)
    if (isHeading) {
      flush()
      out.push(line)
      continue
    }
    if (cur.join('\n').length + line.length > TARGET_PIECE_CHARS / 2) flush()
    cur.push(line)
  }
  flush()
  return out
}

function splitLong(text: string): string[] {
  const sentences = text.split(/(?<=[.!?؟。])\s+/u)
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > TARGET_PIECE_CHARS) {
      out.push(cur)
      cur = s
    } else {
      cur = cur ? `${cur} ${s}` : s
    }
    while (cur.length > MAX_PARAGRAPH_CHARS) {
      out.push(cur.slice(0, TARGET_PIECE_CHARS))
      cur = cur.slice(TARGET_PIECE_CHARS)
    }
  }
  if (cur) out.push(cur)
  return out
}

export type DetectedLanguage = { lang: 'en' | 'ar' | 'de' | null; confident: boolean }

const DE_WORDS =
  /\b(der|die|das|und|ist|nicht|ein|eine|mit|für|auf|den|von|sich|werden|wird|auch|dem|des|zum|zur|bei|oder|sind)\b/giu
const EN_WORDS =
  /\b(the|and|is|of|to|in|that|with|for|are|this|by|it|as|be|on|from|which|or|an)\b/giu

/** Script + stop-word heuristic for the three launch languages. Null means "something else". */
export function detectLanguage(text: string): DetectedLanguage {
  const sample = text.slice(0, 20000)
  const arabic = (sample.match(/[؀-ۿݐ-ݿ]/g) ?? []).length
  const latin = (sample.match(/[A-Za-zÀ-ÿ]/g) ?? []).length
  if (arabic + latin === 0) return { lang: null, confident: false }
  if (arabic / (arabic + latin) > 0.4) return { lang: 'ar', confident: arabic > 40 }

  const de = (sample.match(DE_WORDS) ?? []).length + 2 * (sample.match(/[äöüß]/gi) ?? []).length
  const en = (sample.match(EN_WORDS) ?? []).length
  if (de + en < 3) return { lang: null, confident: false }
  const lang = de > en ? 'de' : 'en'
  return { lang, confident: Math.max(de, en) >= 2 * Math.min(de, en) && Math.max(de, en) >= 5 }
}

/** Rough token count: ~4 chars per token for Latin script, ~2.5 for Arabic. */
export function estimateTokens(text: string): number {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length
  return Math.ceil((text.length - arabic) / 4 + arabic / 2.5)
}

const PROMPT_OVERHEAD_TOKENS = 1400

export interface Estimate {
  textTokens: number
  /** Tokens sent in total: the text twice (outline + details) plus instructions per request. */
  tokensSent: number
  requestsMin: number
  requestsMax: number
  /** Rough reply size: blocks, details and summaries come out at about the text's length. */
  tokensOut: number
}

export function estimateRun(paragraphs: Paragraph[]): Estimate {
  const textTokens = estimateTokens(paragraphs.map((p) => `P${p.n}: ${p.text}`).join('\n\n'))
  const sectionsMin = Math.min(3, Math.max(1, Math.ceil(paragraphs.length / 6)))
  const sectionsMax = Math.min(7, Math.max(sectionsMin, Math.ceil(paragraphs.length / 2)))
  return {
    textTokens,
    tokensSent: textTokens * 2 + PROMPT_OVERHEAD_TOKENS * (1 + sectionsMax),
    requestsMin: 1 + sectionsMin,
    requestsMax: 1 + sectionsMax,
    tokensOut: Math.round(textTokens * 0.8) + 300 * (1 + sectionsMax),
  }
}

/** Whether one outline request can hold the whole text for this model (half the window, to leave room). */
export function fitsInOneRequest(
  paragraphs: Paragraph[],
  inputTokenLimit: number | undefined,
): boolean {
  const limit = inputTokenLimit ?? 128_000
  return estimateRun(paragraphs).textTokens + PROMPT_OVERHEAD_TOKENS <= limit * 0.5
}
