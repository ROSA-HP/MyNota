import type { DetailBlock } from './database.types'
import { fixInlineLatex } from './fixInlineLatex'

export interface FormulaLegendEntry {
  symbol: string
  meaning: string
}

function findMatchingBrace(s: string, openIdx: number): number {
  let depth = 1
  let i = openIdx + 1
  while (i < s.length && depth > 0) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      i += 2
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') depth--
    i++
  }
  return depth === 0 ? i : -1
}

/**
 * Strips stray top-level \text{...} wrappers while leaving subscripts/superscripts like
 * E_{\text{rms}} or \text{m/s} inside mathematical expressions intact.
 */
function unwrapTopLevelTextCommands(raw: string): string {
  let out = ''
  let i = 0
  let braceDepth = 0

  while (i < raw.length) {
    if (raw[i] === '\\' && raw.startsWith('\\text{', i)) {
      const prev = i > 0 ? raw[i - 1] : ''
      const isScriptArg = braceDepth > 0 || prev === '_' || prev === '^'
      const openIdx = i + 5
      const endIdx = findMatchingBrace(raw, openIdx)
      if (!isScriptArg && endIdx !== -1) {
        const inner = raw.slice(openIdx + 1, endIdx - 1)
        out += inner
        i = endIdx
        continue
      }
    }

    const ch = raw[i]
    if (ch === '\\' && i + 1 < raw.length) {
      out += ch + raw[i + 1]
      i += 2
      continue
    }
    if (ch === '{') braceDepth++
    else if (ch === '}' && braceDepth > 0) braceDepth--
    out += ch
    i++
  }

  return out
}

/**
 * Splits a legend string on `;` at brace depth 0 (after unwrapping stray top-level `\text{...}`),
 * or on `,` at brace depth 0 if there are no semicolons and multiple `=` entries.
 */
function splitLegendClauses(raw: string): string[] {
  const prepared = unwrapTopLevelTextCommands(fixInlineLatex(raw))
  const bySemi: string[] = []
  let start = 0
  let depth = 0

  for (let i = 0; i < prepared.length; i++) {
    const ch = prepared[i]
    if (ch === '\\' && i + 1 < prepared.length) {
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}' && depth > 0) depth--
    else if (ch === ';' && depth === 0) {
      const part = prepared.slice(start, i).trim()
      if (part) bySemi.push(part)
      start = i + 1
    }
  }
  const tail = prepared.slice(start).trim()
  if (tail) bySemi.push(tail)

  if (bySemi.length === 1 && prepared.includes(',')) {
    const byComma: string[] = []
    let cStart = 0
    depth = 0
    for (let i = 0; i < prepared.length; i++) {
      const ch = prepared[i]
      if (ch === '\\' && i + 1 < prepared.length) {
        i++
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}' && depth > 0) depth--
      else if (ch === ',' && depth === 0) {
        const part = prepared.slice(cStart, i).trim()
        if (part) byComma.push(part)
        cStart = i + 1
      }
    }
    const cTail = prepared.slice(cStart).trim()
    if (cTail) byComma.push(cTail)
    if (byComma.length > 1 && byComma.every((part) => findTopLevelEquals(part) > 0)) {
      return byComma
    }
  }

  return bySemi
}

function findTopLevelEquals(s: string): number {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}' && depth > 0) depth--
    else if (ch === '=' && depth === 0) return i
  }
  return -1
}

function cleanLegendSymbol(raw: string): string {
  let sym = fixInlineLatex(raw.trim())
  if (sym.startsWith('$') && sym.endsWith('$') && sym.length >= 2) {
    sym = sym.slice(1, -1).trim()
  }
  if (sym.startsWith('\\(') && sym.endsWith('\\)') && sym.length >= 4) {
    sym = sym.slice(2, -2).trim()
  }
  return sym
}

function cleanLegendMeaning(raw: string): string {
  let meaning = unwrapTopLevelTextCommands(fixInlineLatex(raw.trim())).trim()
  // Strip unbalanced trailing brace or leading outer \text wrapper fragments left by malformed AI strings
  if (meaning.startsWith('\\text{')) {
    meaning = meaning.slice(6).trim()
  }
  if (meaning.endsWith('}') && !meaning.includes('{')) {
    meaning = meaning.slice(0, -1).trim()
  }
  return meaning
}

/**
 * Parses legacy variable legend strings (including semicolon inside \text{...}) into structured
 * `{ symbol, meaning }` pairs. Returns `[]` if the string does not contain `symbol = meaning` entries.
 */
export function parseFormulaLegend(
  raw?: string | null,
  existing?: ReadonlyArray<FormulaLegendEntry> | null,
): FormulaLegendEntry[] {
  if (existing && existing.length > 0) {
    const cleaned = existing
      .map((e) => ({
        symbol: cleanLegendSymbol(e.symbol),
        meaning: cleanLegendMeaning(e.meaning),
      }))
      .filter((e) => e.symbol.length > 0 && e.meaning.length > 0)
    if (cleaned.length > 0) return cleaned
  }

  if (!raw || !raw.trim()) return []

  const clauses = splitLegendClauses(raw)
  const entries: FormulaLegendEntry[] = []

  for (const clause of clauses) {
    const eqIdx = findTopLevelEquals(clause)
    if (eqIdx <= 0) continue
    const symbol = cleanLegendSymbol(clause.slice(0, eqIdx))
    const meaning = cleanLegendMeaning(clause.slice(eqIdx + 1))
    if (symbol && meaning) {
      entries.push({ symbol, meaning })
    }
  }

  return entries
}

/** Formats structured legend entries back into semicolon-separated notation for plain/Markdown exports. */
export function formatFormulaLegend(entries: ReadonlyArray<FormulaLegendEntry>): string {
  return entries.map((e) => `${e.symbol} = ${e.meaning}`).join('; ')
}

/** Resolves structured legend entries and optional fallback plain text from a formula DetailBlock. */
export function resolveFormulaLegend(
  detail: Extract<DetailBlock, { kind: 'formula' }>,
): { entries: FormulaLegendEntry[]; fallbackText?: string } {
  const entries = parseFormulaLegend(detail.variables, detail.legend)
  if (entries.length > 0) return { entries }
  if (detail.variables && detail.variables.trim()) {
    return { entries: [], fallbackText: detail.variables.trim() }
  }
  return { entries: [] }
}

/** Migrates any legacy `variables` string on a formula DetailBlock to also carry structured `legend`. */
export function migrateFormulaDetail(detail: DetailBlock): DetailBlock {
  if (detail.kind !== 'formula') return detail
  const entries = parseFormulaLegend(detail.variables, detail.legend)
  if (entries.length === 0) return detail
  return {
    ...detail,
    legend: entries,
    variables: detail.variables ?? formatFormulaLegend(entries),
  }
}
