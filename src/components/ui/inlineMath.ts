export type InlineMathSegment =
  | { kind: 'text'; text: string }
  | { kind: 'math'; latex: string }

const GREEK_WORDS = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'varpi',
  'rho',
  'varrho',
  'sigma',
  'varsigma',
  'tau',
  'upsilon',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'Gamma',
  'Delta',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Upsilon',
  'Phi',
  'Psi',
  'Omega',
])

const FUNC_WORDS = new Set([
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'log',
  'ln',
  'exp',
  'sqrt',
])

const PREFIX_COMMANDS = new Set(['Delta', 'nabla', 'partial'])

const LATEX_COMMANDS = new Set([
  ...GREEK_WORDS,
  ...FUNC_WORDS,
  'Alpha',
  'Beta',
  'Epsilon',
  'Zeta',
  'Eta',
  'Iota',
  'Kappa',
  'Mu',
  'Nu',
  'Rho',
  'Tau',
  'Chi',
  'vec',
  'hat',
  'bar',
  'tilde',
  'dot',
  'ddot',
  'overline',
  'underline',
  'overrightarrow',
  'overleftarrow',
  'frac',
  'dfrac',
  'tfrac',
  'binom',
  'tbinom',
  'sum',
  'prod',
  'int',
  'oint',
  'iint',
  'iiint',
  'lim',
  'sup',
  'inf',
  'max',
  'min',
  'partial',
  'nabla',
  'infty',
  'text',
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathcal',
  'boldsymbol',
  'operatorname',
  'times',
  'cdot',
  'div',
  'pm',
  'mp',
  'ast',
  'star',
  'circ',
  'bullet',
  'approx',
  'equiv',
  'neq',
  'ne',
  'leq',
  'geq',
  'le',
  'ge',
  'll',
  'gg',
  'propto',
  'sim',
  'simeq',
  'cong',
  'to',
  'rightarrow',
  'leftarrow',
  'leftrightarrow',
  'Rightarrow',
  'Leftarrow',
  'Leftrightarrow',
  'mapsto',
  'in',
  'notin',
  'subset',
  'subseteq',
  'hbar',
  'ell',
  'Re',
  'Im',
  'aleph',
  'angle',
  'perp',
  'parallel',
  'degree',
  'langle',
  'rangle',
  'left',
  'right',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'quad',
  'qquad',
  'prime',
])

const UNICODE_GREEK: Record<string, string> = {
  α: '\\alpha',
  β: '\\beta',
  γ: '\\gamma',
  δ: '\\delta',
  ε: '\\epsilon',
  ζ: '\\zeta',
  η: '\\eta',
  θ: '\\theta',
  ι: '\\iota',
  κ: '\\kappa',
  λ: '\\lambda',
  μ: '\\mu',
  ν: '\\nu',
  ξ: '\\xi',
  π: '\\pi',
  ρ: '\\rho',
  σ: '\\sigma',
  τ: '\\tau',
  υ: '\\upsilon',
  φ: '\\phi',
  ϕ: '\\phi',
  χ: '\\chi',
  ψ: '\\psi',
  ω: '\\omega',
  Γ: '\\Gamma',
  Δ: '\\Delta',
  Θ: '\\Theta',
  Λ: '\\Lambda',
  Ξ: '\\Xi',
  Π: '\\Pi',
  Σ: '\\Sigma',
  Φ: '\\Phi',
  Ψ: '\\Psi',
  Ω: '\\Omega',
}

const UNICODE_SUPER: Record<string, string> = {
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

const UNICODE_SUB: Record<string, string> = {
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
  '₊': '+',
  '₋': '-',
}

function readBalanced(s: string, start: number, open: string, close: string): number {
  if (s[start] !== open) return -1
  let depth = 1
  let i = start + 1
  while (i < s.length && depth > 0) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      i += 2
      continue
    }
    if (ch === open) depth++
    else if (ch === close) depth--
    i++
  }
  return depth === 0 ? i : -1
}

function readScripts(s: string, start: number): number {
  let i = start
  while (i < s.length && (s[i] === '_' || s[i] === '^')) {
    const next = s[i + 1]
    if (!next) break
    if (next === '{') {
      const end = readBalanced(s, i + 1, '{', '}')
      if (end === -1) break
      i = end
      continue
    }
    const rest = s.slice(i + 1)
    const m = /^[A-Za-z0-9]+/.exec(rest)
    if (m) {
      i += 1 + m[0].length
      continue
    }
    if (next === '\\') {
      const cmdEnd = readLatexAtom(s, i + 1)
      if (cmdEnd !== -1) {
        i = cmdEnd.end
        continue
      }
    }
    break
  }
  return i
}

function readLatexAtom(s: string, start: number): { end: number; command: string } | -1 {
  if (s[start] !== '\\') return -1
  const m = /^\\([A-Za-z]+)/.exec(s.slice(start))
  if (!m) return -1
  const command = m[1] ?? ''
  if (!LATEX_COMMANDS.has(command)) return -1

  let i = start + 1 + command.length
  if (command === 'sqrt' && s[i] === '[') {
    const optEnd = readBalanced(s, i, '[', ']')
    if (optEnd !== -1) i = optEnd
  }

  // Consume immediate {arg} groups (e.g., \vec{E}, \frac{1}{\sqrt{LC}}, \text{ m/s})
  while (i < s.length) {
    if (s[i] === '{') {
      const grpEnd = readBalanced(s, i, '{', '}')
      if (grpEnd === -1) break
      i = grpEnd
      continue
    }
    if (
      (command === 'frac' || command === 'dfrac' || command === 'tfrac' || command === 'binom') &&
      s[i] === ' ' &&
      s[i + 1] === '{'
    ) {
      const grpEnd = readBalanced(s, i + 1, '{', '}')
      if (grpEnd !== -1) {
        i = grpEnd
        continue
      }
    }
    break
  }

  i = readScripts(s, i)
  return { end: i, command }
}

function isWordBoundaryBefore(s: string, i: number): boolean {
  if (i === 0) return true
  const prev = s[i - 1] ?? ''
  return !/[A-Za-z0-9_\\]/.test(prev)
}

function readScriptedVar(s: string, start: number): number {
  if (!isWordBoundaryBefore(s, start)) return -1
  const m = /^([A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)?)(?=[_^])/.exec(s.slice(start))
  if (!m) return -1
  const stem = m[1] ?? ''
  const afterStem = start + stem.length
  const end = readScripts(s, afterStem)
  if (end <= afterStem) return -1

  const scriptPart = s.slice(afterStem, end)
  const isDigitStem = /^\d/.test(stem)
  const isSingleLetter = stem.length === 1
  const isGreek = GREEK_WORDS.has(stem)
  const isFunc = FUNC_WORDS.has(stem)
  const hasCaret = scriptPart.includes('^')
  const hasBracedSub = /_\{/.test(scriptPart)
  const hasShortSub = /^_[A-Za-z0-9](?![A-Za-z0-9])/.test(scriptPart)

  if (!isDigitStem && !isSingleLetter && !isGreek && !isFunc && !hasCaret && !hasBracedSub && !hasShortSub) {
    return -1
  }

  // Include optional call parens such as cos^2(theta)
  let finalEnd = end
  if (isFunc && s[finalEnd] === '(') {
    const parenEnd = readBalanced(s, finalEnd, '(', ')')
    if (parenEnd !== -1) finalEnd = parenEnd
  }
  return finalEnd
}

function readFuncCall(s: string, start: number): number {
  if (!isWordBoundaryBefore(s, start)) return -1
  const m =
    /^(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|ln|exp|sqrt)\s*\(/.exec(
      s.slice(start),
    )
  if (!m) return -1
  const openIdx = start + m[0].length - 1
  const closeIdx = readBalanced(s, openIdx, '(', ')')
  if (closeIdx === -1) return -1
  return readScripts(s, closeIdx)
}

function readParenMathGroup(s: string, start: number): number {
  if (s[start] !== '(') return -1
  const end = readBalanced(s, start, '(', ')')
  if (end === -1) return -1
  const inner = s.slice(start + 1, end - 1)
  if (
    /\\[A-Za-z]+|[_^=×·≈≤≥≠±∝+\-*]|\d+\s*\/\s*\d+|[A-Za-z0-9]\s+\/\s+[A-Za-z0-9]|[α-ωΑ-Ω₀-₉⁰-⁹]/.test(
      inner,
    )
  ) {
    return end
  }
  return -1
}

function readNumberToken(s: string, start: number): number {
  if (start > 0 && /[A-Za-z0-9_.]/.test(s[start - 1] ?? '')) return -1
  const m = /^\d+(?:\.\d+)?[°]?/.exec(s.slice(start))
  if (!m) return -1
  let end = start + m[0].length
  if (s[end] === '_' || s[end] === '^') {
    end = readScripts(s, end)
  }
  return end
}

const OP_REGEX =
  /^(?:\\(?:times|cdot|div|pm|mp|approx|equiv|neq|ne|leq|geq|le|ge|propto|sim|simeq|cong|to|rightarrow|leftarrow|leftrightarrow)\b|=|≈|×|·|÷|±|∓|≤|≥|≠|∝|−|\+|-|\*|\/)/
const REL_OP_REGEX =
  /^(?:=|≈|×|·|÷|±|≤|≥|≠|∝|\\approx\b|\\times\b|\\cdot\b|\\propto\b|\\le\b|\\ge\b|\\leq\b|\\geq\b|\\neq\b)/

function skipSpaces(s: string, i: number): number {
  let k = i
  while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++
  return k
}

/**
 * Reads a math continuation token (term/operand without leading operator) inside an active math run.
 */
function readMathTerm(
  s: string,
  pos: number,
  options: { allowSingleVar: boolean; allowNumber: boolean; allowGreekWord: boolean },
): { end: number; isPrefixCmd: boolean; hasVarOrMath: boolean } | null {
  if (pos >= s.length) return null

  const latexRes = readLatexAtom(s, pos)
  if (latexRes !== -1) {
    // Include spacing escapes like \, right after command
    let end = latexRes.end
    while (s[end] === '\\' && (s[end + 1] === ',' || s[end + 1] === ';' || s[end + 1] === ' ')) {
      end += 2
    }
    return {
      end,
      isPrefixCmd: PREFIX_COMMANDS.has(latexRes.command),
      hasVarOrMath: true,
    }
  }

  const scriptedEnd = readScriptedVar(s, pos)
  if (scriptedEnd !== -1) {
    return { end: scriptedEnd, isPrefixCmd: false, hasVarOrMath: true }
  }

  const funcEnd = readFuncCall(s, pos)
  if (funcEnd !== -1) {
    return { end: funcEnd, isPrefixCmd: false, hasVarOrMath: true }
  }

  const parenEnd = readParenMathGroup(s, pos)
  if (parenEnd !== -1) {
    return { end: parenEnd, isPrefixCmd: false, hasVarOrMath: true }
  }

  if (options.allowNumber) {
    const numEnd = readNumberToken(s, pos)
    if (numEnd !== -1) {
      return { end: numEnd, isPrefixCmd: false, hasVarOrMath: false }
    }
  }

  // Greek word inside math run (e.g. "theta" in "theta_B + theta")
  if (options.allowGreekWord && isWordBoundaryBefore(s, pos)) {
    const wm = /^[A-Za-z]+/.exec(s.slice(pos))
    if (wm && GREEK_WORDS.has(wm[0])) {
      return { end: pos + wm[0].length, isPrefixCmd: false, hasVarOrMath: true }
    }
  }

  // Unicode Greek + optional Unicode subscripts (e.g. μ₀)
  const uniM = /^[α-ωΑ-Ω][₀-₉⁰-⁹]*/.exec(s.slice(pos))
  if (uniM) {
    return { end: pos + uniM[0].length, isPrefixCmd: false, hasVarOrMath: true }
  }

  // Single-letter variable (e.g. 'c', 'I', 'p', 'U')
  if (options.allowSingleVar && isWordBoundaryBefore(s, pos)) {
    const sm = /^[A-Za-z](?![A-Za-z0-9_])/.exec(s.slice(pos))
    if (sm) {
      const ch = sm[0]
      // Avoid absorbing English article "a"/"A" or pronoun "I" before prose words
      const afterSp = skipSpaces(s, pos + 1)
      const nextWord = /^[A-Za-z]{2,}/.exec(s.slice(afterSp))
      if (
        nextWord &&
        !GREEK_WORDS.has(nextWord[0]) &&
        !FUNC_WORDS.has(nextWord[0]) &&
        !/^[A-Za-z]{2,}[_^]/.test(s.slice(afterSp))
      ) {
        return null
      }
      if ((ch === 'a' || ch === 'A') && afterSp > pos + 1 && /^[a-z]/.test(s.slice(afterSp))) {
        return null
      }
      return { end: pos + 1, isPrefixCmd: false, hasVarOrMath: true }
    }
  }

  return null
}

/**
 * Checks whether starting at `pos` there is a complete equation LHS = RHS (e.g. `c = E_m / B_m`,
 * `I = P_s / (4\pi r^2)`, `c \approx 3.0 \times 10^8\text{ m/s}`).
 */
function tryReadEquationRun(s: string, start: number): number {
  if (!isWordBoundaryBefore(s, start)) return -1
  const lhsM = /^([A-Z]{1,3}(?![A-Za-z])|[a-z](?![A-Za-z])|[α-ωΑ-Ω][₀-₉⁰-⁹]*)/.exec(s.slice(start))
  if (!lhsM) return -1
  let cur = start + lhsM[0].length
  const afterSp = skipSpaces(s, cur)
  const relM = REL_OP_REGEX.exec(s.slice(afterSp))
  if (!relM) return -1

  cur = skipSpaces(s, afterSp + relM[0].length)
  // RHS must look mathematical (start with a math term, not a prose word)
  const firstRhs = readMathTerm(s, cur, {
    allowSingleVar: true,
    allowNumber: true,
    allowGreekWord: true,
  })
  if (!firstRhs) return -1

  cur = firstRhs.end
  // If firstRhs was just a plain number without further operators/math terms (e.g. "n = 1.5 for glass"),
  // require a trailing math operator or LaTeX relation.
  const extended = extendMathRun(s, cur, firstRhs.isPrefixCmd)
  if (extended === cur && !firstRhs.hasVarOrMath && !relM[0].startsWith('\\')) {
    return -1
  }
  return extended
}

function extendMathRun(s: string, initialEnd: number, initialPrefixCmd: boolean): number {
  let cur = initialEnd
  let prevWasPrefixCmd = initialPrefixCmd

  while (cur < s.length) {
    const sp = skipSpaces(s, cur)
    const opM = OP_REGEX.exec(s.slice(sp))
    if (opM) {
      const afterOp = skipSpaces(s, sp + opM[0].length)
      // An operator continues ONLY if followed by a valid math term (never a prose word!)
      const rhs = readMathTerm(s, afterOp, {
        allowSingleVar: true,
        allowNumber: true,
        allowGreekWord: true,
      })
      if (!rhs) break
      if (opM[0] === '=' && !rhs.hasVarOrMath) {
        const peekAfterNum = extendMathRunPeek(s, rhs.end)
        if (!peekAfterNum && !s.slice(afterOp, rhs.end).includes('°')) {
          break
        }
      }
      cur = rhs.end
      prevWasPrefixCmd = rhs.isPrefixCmd
      continue
    }

    // Immediate adjacency or implicit multiplication inside math run
    const adjacent = readMathTerm(s, sp, {
      allowSingleVar: prevWasPrefixCmd || sp === cur, // e.g. \Delta p or 4\pi r^2 or c\mu_0
      allowNumber: sp === cur, // glued coefficient/script only
      allowGreekWord: sp === cur,
    })
    if (adjacent) {
      if (
        sp > cur &&
        !prevWasPrefixCmd &&
        /^[A-Za-z]$/.test(s.slice(sp, adjacent.end)) &&
        !/^[A-Za-z](?:[_^]|\s*[=+\-*/×·])/.test(s.slice(sp))
      ) {
        break
      }
      cur = adjacent.end
      prevWasPrefixCmd = adjacent.isPrefixCmd
      continue
    }

    // Also allow implicit multiplication between math terms separated by space: e.g. "2\Delta U", "c \mu_0"
    if (sp > cur) {
      const nextLatex = readLatexAtom(s, sp)
      if (nextLatex !== -1) {
        cur = nextLatex.end
        prevWasPrefixCmd = PREFIX_COMMANDS.has(nextLatex.command)
        continue
      }
      const nextScript = readScriptedVar(s, sp)
      if (nextScript !== -1) {
        cur = nextScript
        prevWasPrefixCmd = false
        continue
      }
      const nextParen = readParenMathGroup(s, sp)
      if (nextParen !== -1) {
        cur = nextParen
        prevWasPrefixCmd = false
        continue
      }
    }

    break
  }

  return cur
}

function extendMathRunPeek(s: string, pos: number): boolean {
  const sp = skipSpaces(s, pos)
  return OP_REGEX.test(s.slice(sp)) || /^\\(?:times|cdot|approx|text)\b/.test(s.slice(sp))
}

/**
 * Normalizes a bare math expression extracted from prose into valid KaTeX LaTeX.
 */
export function normalizeBareLatex(raw: string): string {
  let out = raw.trim()

  // Replace Unicode math characters
  out = out.replace(/[α-ωΑ-Ω]/g, (ch) => `${UNICODE_GREEK[ch] ?? ch} `)
  out = out.replace(/°/g, '^{\\circ}')
  out = out.replace(/×/g, '\\times ')
  out = out.replace(/·/g, '\\cdot ')
  out = out.replace(/÷/g, '\\div ')
  out = out.replace(/±/g, '\\pm ')
  out = out.replace(/≤/g, '\\le ')
  out = out.replace(/≥/g, '\\ge ')
  out = out.replace(/≠/g, '\\neq ')
  out = out.replace(/≈/g, '\\approx ')
  out = out.replace(/∝/g, '\\propto ')
  out = out.replace(/−/g, '-')

  // Unicode superscript/subscript digits
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (seq) => {
    const mapped = Array.from(seq)
      .map((c) => UNICODE_SUPER[c] ?? c)
      .join('')
    return `^{${mapped}}`
  })
  out = out.replace(/[₀₁₂₃₄₅₆₇₈₉₊₋]+/g, (seq) => {
    const mapped = Array.from(seq)
      .map((c) => UNICODE_SUB[c] ?? c)
      .join('')
    return `_{${mapped}}`
  })

  // Protect \text{...} and \mathrm{...} spans before replacing bare * or bare Greek words
  const protectedSpans: string[] = []
  out = out.replace(/\\(?:text|mathrm|mathbf|mathit)\{[^{}]*\}/g, (m) => {
    const idx = protectedSpans.length
    protectedSpans.push(m)
    return `\uE000${idx}\uE001`
  })

  out = out.replace(/\s*\*\s*/g, ' \\cdot ')
  out = out.replace(
    /(^|[^\\A-Za-z])(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Delta|Theta|Lambda|Sigma|Omega|Phi|Psi|Gamma)(?![A-Za-z])/g,
    (_m, prefix: string, name: string) => `${prefix}\\${name}`,
  )

  out = out.replace(/\uE000(\d+)\uE001/g, (_m, idxStr: string) => {
    const idx = Number(idxStr)
    return protectedSpans[idx] ?? ''
  })

  return out.replace(/\s{2,}/g, ' ').trim()
}

function splitBareMath(segment: string): InlineMathSegment[] {
  if (!segment) return []
  const out: InlineMathSegment[] = []
  let textStart = 0
  let i = 0

  const flushText = (end: number) => {
    if (end > textStart) {
      out.push({ kind: 'text', text: segment.slice(textStart, end) })
    }
  }

  while (i < segment.length) {
    let runEnd = -1

    // 1. LaTeX command atom (\vec{E}, \mu_0, \frac{...}, \Delta, etc.)
    const latexStart = readLatexAtom(segment, i)
    if (latexStart !== -1) {
      runEnd = extendMathRun(segment, latexStart.end, PREFIX_COMMANDS.has(latexStart.command))
    } else {
      // 2. Scripted variable (u_E, I_{0}, E_rms^2, theta_B, n_1, 10^8)
      const scriptStart = readScriptedVar(segment, i)
      if (scriptStart !== -1) {
        runEnd = extendMathRun(segment, scriptStart, false)
      } else {
        // 3. Function call (arctan(n_2 / n_1), sin(theta))
        const funcStart = readFuncCall(segment, i)
        if (funcStart !== -1) {
          runEnd = extendMathRun(segment, funcStart, false)
        } else {
          // 4. Bare equation starting with short symbol (c = E_m / B_m, I = P_s / (4\pi r^2), c \approx 3.0 \times 10^8\text{ m/s})
          const eqStart = tryReadEquationRun(segment, i)
          if (eqStart !== -1) {
            runEnd = eqStart
          }
        }
      }
    }

    if (runEnd > i) {
      flushText(i)
      const rawMath = segment.slice(i, runEnd)
      out.push({ kind: 'math', latex: normalizeBareLatex(rawMath) })
      i = runEnd
      textStart = i
      continue
    }

    i++
  }

  flushText(segment.length)
  return out
}

/**
 * Splits prose containing delimited ($...$, \(...\), \[...\]) or bare LaTeX equations
 * into alternating plain-text and KaTeX-ready math segments.
 */
export function splitInlineMath(input: string): InlineMathSegment[] {
  if (!input) return []

  const delimited: InlineMathSegment[] = []
  let textStart = 0
  let i = 0

  const pushPlain = (end: number) => {
    if (end > textStart) {
      delimited.push(...splitBareMath(input.slice(textStart, end)))
    }
  }

  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1]

    // Skip escaped dollar sign \$
    if (ch === '\\' && next === '$') {
      i += 2
      continue
    }

    // \[...\] or \(...\)
    if (ch === '\\' && (next === '(' || next === '[')) {
      const closeToken = next === '(' ? '\\)' : '\\]'
      const closeIdx = input.indexOf(closeToken, i + 2)
      if (closeIdx !== -1) {
        const inner = input.slice(i + 2, closeIdx).trim()
        if (inner.length > 0) {
          pushPlain(i)
          delimited.push({ kind: 'math', latex: normalizeBareLatex(inner) })
          i = closeIdx + 2
          textStart = i
          continue
        }
      }
    }

    // $$...$$
    if (ch === '$' && next === '$') {
      const closeIdx = input.indexOf('$$', i + 2)
      if (closeIdx !== -1) {
        const inner = input.slice(i + 2, closeIdx).trim()
        if (inner.length > 0) {
          pushPlain(i)
          delimited.push({ kind: 'math', latex: normalizeBareLatex(inner) })
          i = closeIdx + 2
          textStart = i
          continue
        }
      }
    }

    // Inline $...$
    if (ch === '$' && next !== '$') {
      let k = i + 1
      let found = -1
      while (k < input.length) {
        if (input[k] === '\n' || input[k] === '\r') break
        if (input[k] === '\\' && input[k + 1] === '$') {
          k += 2
          continue
        }
        if (input[k] === '$' && input[k + 1] !== '$') {
          found = k
          break
        }
        k++
      }
      if (found !== -1) {
        const inner = input.slice(i + 1, found).trim()
        const after = input[found + 1] ?? ''
        // Avoid treating "$5 and $10" currency figures as inline LaTeX
        const looksLikeCurrency = /^\d+(?:[.,]\d+)?(?:\s|$)/.test(input.slice(i + 1, found))
        if (inner.length > 0 && !looksLikeCurrency && !/\d/.test(after)) {
          pushPlain(i)
          delimited.push({ kind: 'math', latex: normalizeBareLatex(inner) })
          i = found + 1
          textStart = i
          continue
        }
      }
    }

    i++
  }

  pushPlain(input.length)
  return delimited
}
