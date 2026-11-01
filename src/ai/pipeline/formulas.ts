import type { AiBlock, AiDetail, DetailsResponse } from '../schemas/details'
import { LIMITS } from '../schemas/common'
import type { Paragraph } from '../prompts/shared'

/**
 * Formulas must never get lost between the source and the map (2026-11-01: the owner found
 * maps "always forget the formulas"). Models often (1) write an equation only inside a bullet,
 * (2) skip it, or (3) write LaTeX with single backslashes, which JSON reads as tabs, form feeds
 * or invalid escapes. This module repairs (3) and, after every details reply, checks the
 * section's source: every equation found there ends up as a formula detail, first in the block
 * that cites its paragraph.
 */

// ---------------------------------------------------------------------------
// LaTeX that JSON mangled
// ---------------------------------------------------------------------------

/**
 * Restores LaTeX commands that a single backslash turned into control characters while the
 * JSON was read (\theta → TAB + "heta", \frac → FF + "rac", \beta → BS + "eta", \rho → CR + "ho",
 * \nu → LF + "u"), and collapses doubled backslashes before a command (\\frac → \frac).
 */
export function fixLatex(s: string): string {
  return (
    s
      .replace(/\t(?=[a-zA-Z])/g, '\\t')
      .replace(/\f(?=[a-zA-Z])/g, '\\f')
      // eslint-disable-next-line no-control-regex -- a backspace is exactly what \b turned into
      .replace(/\u0008(?=[a-zA-Z])/g, '\\b')
      .replace(/\r(?=[a-zA-Z])/g, '\\r')
      .replace(/\n(?=[a-zA-Z])/g, '\\n')
      .replace(/\\\\(?=[a-zA-Z])/g, '\\')
      .trim()
  )
}

// ---------------------------------------------------------------------------
// Plain-text math → LaTeX
// ---------------------------------------------------------------------------

const GREEK: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  ϕ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
  Γ: 'Gamma',
  Δ: 'Delta',
  Θ: 'Theta',
  Λ: 'Lambda',
  Ξ: 'Xi',
  Π: 'Pi',
  Σ: 'Sigma',
  Φ: 'Phi',
  Ψ: 'Psi',
  Ω: 'Omega',
}
const SYMBOLS: Record<string, string> = {
  '×': '\\times ',
  '·': '\\cdot ',
  '÷': '\\div ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\neq ',
  '≈': '\\approx ',
  '∝': '\\propto ',
  '∞': '\\infty ',
  '→': '\\to ',
  '∂': '\\partial ',
  '∇': '\\nabla ',
  '∫': '\\int ',
  '∑': '\\sum ',
  '−': '-',
  '–': '-',
  '°': '^{\\circ}',
}
const SUPER: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  ⁿ: 'n',
}
const SUB: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  ₙ: 'n',
  ₘ: 'm',
  ₓ: 'x',
  ᵢ: 'i',
}

/** Turns an equation written with Unicode symbols (d sin θ = mλ, I = I₀ cos²φ) into LaTeX. */
export function toLatex(plain: string): string {
  let s = plain.trim()
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (m) => `^{${[...m].map((c) => SUPER[c]).join('')}}`)
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉ₙₘₓᵢ]+/g, (m) => `_{${[...m].map((c) => SUB[c]).join('')}}`)
  s = s.replace(
    /√\s*(\([^)]*\)|[\w.]+)/g,
    (_m, arg: string) => `\\sqrt{${arg.replace(/^\((.*)\)$/, '$1')}}`,
  )
  s = s.replace(/./gu, (c) => {
    const g = GREEK[c]
    if (g) return `\\${g} `
    return SYMBOLS[c] ?? c
  })
  return s
    .replace(/\s+/g, ' ')
    .replace(/(\\[a-zA-Z]+) (?=[^a-zA-Z0-9\s])/g, '$1')
    .replace(/ (?=[})^_,]|$)/g, '')
    .trim()
}

// ---------------------------------------------------------------------------
// Finding equations in text
// ---------------------------------------------------------------------------

const SIGN = /^(=|≈|≤|≥|∝|≠)$/
const FUNCS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'log',
  'ln',
  'exp',
  'lim',
  'max',
  'min',
  'sqrt',
])
/** Short words that never belong to a formula even though they are short ("a" is a variable). */
const PROSE = new Set([
  'an',
  'the',
  'is',
  'are',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'as',
  'be',
  'it',
  'its',
  'if',
  'so',
  'we',
  'ist',
  'der',
  'die',
  'das',
  'und',
  'ein',
  'mit',
  'für',
  'wo',
  'من',
  'في',
  'على',
  'و',
])

/** A token that belongs to a formula, not to the sentence around it. */
function formulaToken(tok: string): boolean {
  const t = tok.replace(/^[([{]+|[)\]},;:.]+$/g, '')
  if (!t || PROSE.has(t.toLowerCase())) return false
  if (FUNCS.has(t.toLowerCase())) return true
  if (/[\d^_+\-*/·×÷√±()²³⁰¹⁴-⁹₀-₉ⁿ]/.test(t)) return true
  if (/\p{Script=Greek}/u.test(t)) return true
  if (/\\[a-zA-Z]+/.test(t)) return true
  // Short symbols (m, a, D, dθ) are variables; longer words are prose.
  return t.length <= 3 && /^[\p{L}\p{N}'’_]+$/u.test(t)
}

/** A token that closes the formula after it (a comma, or a full stop that is not a decimal). */
const closes = (tok: string) => /[;,:]$/.test(tok) || (/\.$/.test(tok) && !/\d\.$/.test(tok))

/**
 * The equations in a piece of text, as written (d sin θ = mλ, θmin ≈ 1.22 λ/D). Around each
 * relation sign (=, ≈, ≤, ≥, ∝, ≠) it takes the formula-like tokens on both sides and stops at
 * the first ordinary word.
 */
export function findEquations(text: string): string[] {
  const out: string[] = []
  // Maths already written as LaTeX ($…$, $$…$$, \(…\), \[…\]) is taken as it is, when it is an
  // equation (a single symbol such as $\lambda$ is not); the rest of the text is then scanned.
  const rest = text.replace(
    /\$\$([^$]+)\$\$|\$([^$\n]+)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g,
    (whole, a?: string, b?: string, c?: string, d?: string) => {
      const tex = (a ?? b ?? c ?? d ?? '').trim()
      if (!/=|≈|≤|≥|\\(approx|leq?|geq?|neq?|propto)(?![a-zA-Z])/.test(tex)) return whole
      if (!out.includes(tex)) out.push(tex)
      return ' '
    },
  )
  for (const raw of rest.split(/\n|(?<=[.;!?])\s+(?=\p{Lu})/u)) {
    const toks = raw
      .replace(/\s*(=|≈|≤|≥|∝|≠)\s*/g, ' $1 ')
      .trim()
      .split(/\s+/)
    let i = 0
    while (i < toks.length) {
      const sign = toks.findIndex((t, j) => j >= i && SIGN.test(t))
      if (sign < 0) break
      let start = sign
      while (
        start > i &&
        formulaToken(toks[start - 1] as string) &&
        !closes(toks[start - 1] as string)
      )
        start--
      let end = sign
      while (end + 1 < toks.length) {
        const next = toks[end + 1] as string
        if (!SIGN.test(next) && !formulaToken(next)) break
        end++
        if (closes(next)) break
      }
      i = end + 1
      const eq = toks
        .slice(start, end + 1)
        .join(' ')
        .replace(/^[:(]+/, '')
        .replace(/[.;,:]+$/, '')
      const sides = eq.split(/\s*(?:=|≈|≤|≥|∝|≠)\s*/)
      // Something on both sides of every sign, a letter somewhere, and not a whole paragraph.
      if (sides.some((x) => !x) || !/\p{L}/u.test(eq) || eq.length > 90) continue
      // A symbol set to a plain number (m = ±1, n = 1.5) is a value, not a formula.
      if (
        sides.length === 2 &&
        (sides[0] as string).length <= 2 &&
        /^[±+\-−]?[\d.,]+$/.test(sides[1] as string)
      )
        continue
      if (!out.includes(eq)) out.push(eq)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Comparing formulas
// ---------------------------------------------------------------------------

const NAME_OF = Object.fromEntries(Object.entries(GREEK).map(([c, n]) => [c, n]))

const LATEX_SIGN: Record<string, string> = {
  approx: '≈',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  propto: '∝',
}

/**
 * A comparable skeleton: Greek letters spelled out, relation signs as symbols, spacing,
 * braces and markup removed.
 */
export function formulaKey(s: string): string {
  return s
    .replace(/./gu, (c) => NAME_OF[c] ?? SUPER[c] ?? SUB[c] ?? c)
    .replace(
      /\\(approx|leq?|geq?|neq?|propto)(?![a-zA-Z])/g,
      (_m, name: string) => LATEX_SIGN[name] ?? '',
    )
    .replace(
      /\\(frac|dfrac|tfrac|left|right|cdot|times|mathrm|text|operatorname|displaystyle)/g,
      '',
    )
    .replace(/[\\{}\s*·×()[\]^_/,.]/g, '')
    .toLowerCase()
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return out
}

function similar(x: string, y: string, threshold: number): boolean {
  if (!x || !y) return false
  if (x === y || x.includes(y) || y.includes(x)) return true
  const bx = bigrams(x)
  const by = bigrams(y)
  let both = 0
  for (const g of bx) if (by.has(g)) both++
  return both / Math.max(1, bx.size + by.size - both) >= threshold
}

/**
 * Whether two formulas (LaTeX or plain) are the same equation, give or take notation: the left
 * sides must match and the right sides be close, so "β = πa sin θ / λ" is not taken for
 * "a sin θ = mλ" just because they share symbols.
 */
export function sameFormula(a: string, b: string): boolean {
  const x = formulaKey(a)
  const y = formulaKey(b)
  if (!x || !y) return false
  if (x === y) return true
  const [lx = '', ...rx] = x.split(/[=≈≤≥≠∝]/)
  const [ly = '', ...ry] = y.split(/[=≈≤≥≠∝]/)
  if (!rx.length || !ry.length) return similar(x, y, 0.75)
  return similar(lx, ly, 0.75) && similar(rx.join('='), ry.join('='), 0.5)
}

// ---------------------------------------------------------------------------
// The safety net
// ---------------------------------------------------------------------------

function formulasOf(b: AiBlock): string[] {
  return b.details.filter((d) => d.kind === 'formula').map((d) => d.text)
}

/** Formula details first (the canvas shows the first one on the card), order otherwise kept. */
function formulasFirst(details: AiDetail[]): AiDetail[] {
  return [
    ...details.filter((d) => d.kind === 'formula'),
    ...details.filter((d) => d.kind !== 'formula'),
  ]
}

/** Adds a formula after the block's other formulas (so formulas keep the source's order). */
function withFormula(b: AiBlock, latex: string): AiBlock {
  const at = b.details.filter((d) => d.kind === 'formula').length
  const details = [
    ...b.details.slice(0, at),
    { kind: 'formula' as const, text: latex },
    ...b.details.slice(at),
  ]
  // Keep within the per-block limit: drop the last non-formula detail if needed.
  while (details.length > LIMITS.maxDetailsPerBlock) {
    const i = details.map((d) => d.kind).lastIndexOf('text')
    const j = i >= 0 ? i : details.map((d) => d.kind !== 'formula').lastIndexOf(true)
    if (j < 0) break
    details.splice(j, 1)
  }
  return { ...b, details }
}

/**
 * Makes sure a section's formulas survive the details reply:
 * - formula details get their LaTeX repaired and come first in their block;
 * - an equation written only inside a block's bullet becomes a formula detail of that block;
 * - an equation in the section's source that no formula detail covers is added to the block
 *   citing its paragraph (a formula block first), so nothing in the notes is lost.
 */
export function ensureFormulas(
  res: DetailsResponse,
  paragraphs: readonly Paragraph[],
): DetailsResponse {
  let blocks = res.blocks.map((b) => ({
    ...b,
    details: formulasFirst(
      b.details.map((d) =>
        d.kind === 'formula'
          ? { ...d, text: fixLatex(d.text), ...(d.extra ? { extra: fixLatex(d.extra) } : {}) }
          : d,
      ),
    ),
  }))

  const known = () => blocks.flatMap(formulasOf)

  // Equations the model wrote in a bullet or text only.
  blocks = blocks.map((b) => {
    let out = b
    for (const d of b.details) {
      if (d.kind !== 'bullet' && d.kind !== 'text') continue
      for (const eq of findEquations(d.text)) {
        if (
          known().some((k) => sameFormula(k, eq)) ||
          formulasOf(out).some((k) => sameFormula(k, eq))
        )
          continue
        out = withFormula(out, toLatex(eq))
      }
    }
    return out
  })

  // Equations in the source that are nowhere in the reply.
  for (const p of paragraphs) {
    for (const eq of findEquations(p.text)) {
      if (known().some((k) => sameFormula(k, eq))) continue
      const citing = blocks.filter((b) => b.source.includes(p.n))
      const target =
        citing.find((b) => b.type === 'formula') ??
        citing[0] ??
        blocks.find((b) => b.type === 'formula') ??
        blocks[0]
      if (!target) continue
      blocks = blocks.map((b) => (b === target ? withFormula(b, toLatex(eq)) : b))
    }
  }

  return { ...res, blocks: blocks.map((b) => ({ ...b, details: formulasFirst(b.details) })) }
}
