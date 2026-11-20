import type { CSSProperties } from 'react'
import { formulaKey } from '@/ai/pipeline/formulas'
import { splitInlineMath } from '@/components/ui/inlineMath'
import { validateLatex } from '@/components/ui/MathFormula'
import { fixInlineLatex } from '@/lib/fixInlineLatex'
import { migrateFormulaDetail, resolveFormulaLegend } from '@/lib/formulaLegend'
import type { DetailBlock } from '@/lib/database.types'
import type { OutlineItem } from '../outline'

export type ExportWarningKind = 'preamble' | 'katex' | 'science' | 'integrity' | 'typo'

export interface ExportWarning {
  id: string
  kind: ExportWarningKind
  location: string
  title: string
  detail: string
  raw?: string
}

const PREAMBLE_RE =
  /^\s*(?:(?:here\s+is|here's|here\u2019s|below\s+is|the\s+following\s+is)\b[^.\n:]*[:.]\s*|(?:here\s+is|here's|here\u2019s|below\s+is)\s+(?:a|an|the)\s+(?:comprehensive\s+|detailed\s+|concise\s+|quick\s+|brief\s+)?(?:breakdown|summary|overview|explanation|guide|list|notes)\b[^.\n]*(?:\.\s*|\n+))/i

const STANDALONE_PREAMBLE_RE =
  /^\s*(?:here\s+is|here's|here\u2019s|below\s+is|the\s+following\s+is)\s+(?:a|an|the)\s+(?:comprehensive\s+|detailed\s+|concise\s+|quick\s+|brief\s+)?(?:breakdown|summary|overview|explanation|guide|list|notes)\b[^.!?\n]*[.!]?\s*$/i

/** Strips leading AI filler commentary ("Here is...", "Here's...", "Below is...") if present. */
export function stripAiPreamble(text: string): { cleaned: string; removed: string | null } {
  if (!text) return { cleaned: text, removed: null }
  const m = PREAMBLE_RE.exec(text)
  if (m) {
    const removed = m[0].trim()
    const cleaned = text.slice(m[0].length).trimStart()
    if (cleaned) return { cleaned, removed }
    if (STANDALONE_PREAMBLE_RE.test(text)) {
      return { cleaned: '', removed: text.trim() }
    }
    return { cleaned: text, removed: null }
  }
  if (STANDALONE_PREAMBLE_RE.test(text)) {
    return { cleaned: '', removed: text.trim() }
  }
  return { cleaned: text, removed: null }
}

/**
 * Detects language ('ar' | 'de' | 'en') per text block for proper HTML `lang` hyphenation
 * and script-safe rules (never hyphenate Arabic, enable hyphenation for EN/DE).
 */
export function detectBlockLang(text: string, fallbackLang: 'en' | 'de' | 'ar' = 'en'): 'en' | 'de' | 'ar' {
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)) {
    return 'ar'
  }
  if (
    /[äöüÄÖÜß]/.test(text) ||
    /\b(?:und|der|die|das|ein|eine|einer|mit|für|auf|ist|sind|durch|zwischen|über|unter|werden|wird|als|bei|nach|vom|zum|zur)\b/i.test(
      text,
    )
  ) {
    return 'de'
  }
  if (fallbackLang === 'de' && !/\b(?:the|and|with|for|that|this|from|which|are|is)\b/i.test(text)) {
    return 'de'
  }
  return 'en'
}

export function proseTypographyStyle(
  text: string,
  fallbackLang: 'en' | 'de' | 'ar' = 'en',
): {
  lang: 'en' | 'de' | 'ar'
  dir: 'auto'
  style: CSSProperties
} {
  const lang = detectBlockLang(text, fallbackLang)
  const isArabic = lang === 'ar'
  return {
    lang,
    dir: 'auto',
    style: {
      textAlign: 'justify',
      textAlignLast: 'start',
      textJustify: 'inter-word',
      widows: 2,
      orphans: 2,
      hyphens: isArabic ? 'none' : 'auto',
      WebkitHyphens: isArabic ? 'none' : 'auto',
      ...(isArabic ? { letterSpacing: 'normal' } : {}),
    },
  }
}

function normTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function checkFormulaScience(latex: string, contextText: string): string | null {
  const compact = latex.replace(/\s+/g, '')
  if (
    /u_\{?E\}?\s*=/.test(compact) &&
    /B\^?\{?2\}?\s*\/\s*\(?2\\?(?:mu_?\{?0\}?|μ₀)/.test(compact) &&
    !/E\^?\{?2\}?/.test(compact)
  ) {
    return `Formula uses u_E alongside B^2 / (2\\mu_0)${contextText ? ` in "${contextText}"` : ''}; u_B may be intended for magnetic energy density.`
  }
  return null
}

function isScalarValueFormula(latex: string): boolean {
  const sides = latex.split(/\s*(?:=|≈|≤|≥)\s*/)
  if (sides.length !== 2) return false
  const [lhs = '', rhs = ''] = sides
  const cleanLhs = lhs.replace(/\\[a-zA-Z]+|[{}\s]/g, '')
  const cleanRhs = rhs.replace(
    /\\(?:pm|mp|circ|degree|deg|ldots|dots|cdots)(?![a-zA-Z])|\\text\{[^{}]*\}|[\^°{}\s\d.,±+\-−…]/g,
    '',
  )
  return cleanLhs.length <= 2 && cleanRhs === ''
}

function checkFormulaBlockTopic(
  latex: string,
  blockTitle: string,
  sectionTitle: string,
): string | null {
  const ctx = `${sectionTitle} ${blockTitle}`.toLowerCase()
  const key = formulaKey(latex)

  // Radiation-pressure formulas (p_r = 2I/c, F = 2IA/c, p_r = I/c, Δp = 2ΔU/c) inside polarization/transmitted/malus/brewster
  const isRadPressureEq =
    key.includes('pr=2ic') ||
    key.includes('pr=ic') ||
    key.includes('f=2iac') ||
    key.includes('f=iac') ||
    key.includes('δp=') ||
    key.includes('deltap=')
  if (
    isRadPressureEq &&
    /(polariz|transmitted|one-half|half rule|malus|brewster|dispersion)/i.test(ctx) &&
    !/(radiation\s*pressure|absorption|reflection)/i.test(blockTitle)
  ) {
    return `Formula "${latex}" describes radiation pressure / momentum transfer, which does not match block "${blockTitle}".`
  }

  // Malus / One-half / Brewster equations inside Radiation Pressure or Energy Density
  const isPolarizationEq =
    key.includes('cos2') ||
    key.includes('thetab') ||
    key.includes('arctan') ||
    key.includes('tan-1')
  if (
    isPolarizationEq &&
    /(radiation\s*pressure|absorption|total reflection|poynting|energy density)/i.test(blockTitle)
  ) {
    return `Formula "${latex}" describes optical polarization, which does not match block "${blockTitle}".`
  }

  return null
}

function checkMisplacedBullet(
  text: string,
  blockTitle: string,
  sectionTitle: string,
): string | null {
  if (/belong(?:s)?\s+to\s+(?:the\s+)?(?:preceding|previous|other|another)\s+(?:chapter|section)/i.test(text)) {
    return `Bullet in "${blockTitle}" states it belongs to another section: "${text}"`
  }

  const lower = text.toLowerCase()
  const blockLower = blockTitle.toLowerCase()
  const secLower = sectionTitle.toLowerCase()

  // Radiation pressure / reflection force bullet sitting in polarization section/block
  if (
    /(radiation\s+pressure|reflection\s+force|momentum\s+transfer\s+on\s+(?:absorption|reflection))/.test(
      lower,
    ) &&
    /(polariz|malus|one-half|brewster|dispersion|transmitted)/.test(`${blockLower} ${secLower}`) &&
    !/(radiation|pressure|momentum)/.test(blockLower)
  ) {
    return `Radiation-pressure / reflection bullet is placed inside polarization block "${blockTitle}".`
  }

  // Energy density bullet inside Wave Intensity (excluding intensity/power per unit area explanations)
  if (
    /(energy\s+density|joules\s+per\s+cubic\s+meter|u_e\s*=|u_b\s*=|stored\s+per\s+unit\s+volume)/.test(
      lower,
    ) &&
    /intensity/.test(blockLower) &&
    !/energy\s+density/.test(blockLower) &&
    !/(power\s+per\s+unit\s+area|watt)/.test(lower)
  ) {
    return `Energy-density bullet is placed inside Wave Intensity block "${blockTitle}".`
  }

  return null
}

function findTypoHints(text: string): Array<{ found: string; suggestion: string }> {
  const hints: Array<{ found: string; suggestion: string }> = []
  if (/\belectric\s+held\b/i.test(text)) {
    hints.push({ found: 'electric held', suggestion: 'electric field' })
  }
  if (/\bmagnetic\s+held\b/i.test(text)) {
    hints.push({ found: 'magnetic held', suggestion: 'magnetic field' })
  }
  return hints
}

function collectMathErrorsInText(
  text: string,
  location: string,
  title: string,
  warnings: ExportWarning[],
  seen: Set<string>,
  options?: { legend?: boolean },
) {
  if (!text) return
  const segments = splitInlineMath(text, options)
  for (const seg of segments) {
    if (seg.kind !== 'math') continue
    const err = validateLatex(seg.latex, false)
    if (err) {
      const key = `katex:${location}:${seg.latex}`
      if (seen.has(key)) continue
      seen.add(key)
      warnings.push({
        id: key,
        kind: 'katex',
        location,
        title: `KaTeX syntax error in "${title}"`,
        detail: err,
        raw: seg.latex,
      })
    }
  }
}

export function cleanAndAnalyzeOutline(items: OutlineItem[]): {
  cleanedItems: OutlineItem[]
  warnings: ExportWarning[]
} {
  const warnings: ExportWarning[] = []
  const seen = new Set<string>()
  let warnSeq = 0

  const addWarn = (w: Omit<ExportWarning, 'id'>) => {
    const key = `${w.kind}:${w.location}:${w.title}:${w.raw ?? w.detail}`
    if (seen.has(key)) return
    seen.add(key)
    warnSeq++
    warnings.push({ id: `w-${warnSeq}`, ...w })
  }

  const scanTextForHintsAndMath = (text: string, location: string, title: string) => {
    collectMathErrorsInText(text, location, title, warnings, seen)
    for (const h of findTypoHints(text)) {
      addWarn({
        kind: 'typo',
        location,
        title: `Possible typo in "${title}"`,
        detail: `"${h.found}" looks like a scan/OCR typo for "${h.suggestion}". Left unchanged — please confirm.`,
        raw: h.found,
      })
    }
  }

  const stack: Array<{ depth: number; level: OutlineItem['level']; title: string }> = []
  let currentSectionTitle = ''
  const seenFormulaBlocks = new Map<string, string>()

  const cleanedItems = items.map((item) => {
    while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= item.depth) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    const cleanTitle = fixInlineLatex(item.title || 'Untitled')
    const title = cleanTitle
    const location = `${item.level}: ${title}`

    if (item.level === 'section') {
      currentSectionTitle = title
    }

    // Warn when a child title repeats its parent section or parent block title
    if (
      parent &&
      (item.level === 'block' || item.level === 'section') &&
      (parent.level === 'section' || parent.level === 'block') &&
      normTitle(title) !== '' &&
      normTitle(title) === normTitle(parent.title)
    ) {
      addWarn({
        kind: 'integrity',
        location,
        title: `Title repeats its parent: "${title}"`,
        detail: `Child ${item.level} "${title}" has the exact same title as its parent ${parent.level}.`,
        raw: title,
      })
    }

    stack.push({ depth: item.depth, level: item.level, title })
    scanTextForHintsAndMath(cleanTitle, location, title)

    let summary = item.summary ? fixInlineLatex(item.summary) : ''
    if (summary) {
      const stripped = stripAiPreamble(summary)
      if (stripped.removed) {
        addWarn({
          kind: 'preamble',
          location,
          title: `Removed AI preamble from "${title}" summary`,
          detail: 'Removed leading filler sentence before export.',
          raw: stripped.removed,
        })
        summary = stripped.cleaned
      }
      scanTextForHintsAndMath(summary, `${location} (summary)`, title)
    }

    const detailBlocks: DetailBlock[] = item.detailBlocks.map((rawDetail, idx) => {
      const dLoc = `${location} · detail #${idx + 1}`
      switch (rawDetail.kind) {
        case 'text':
        case 'bullet':
        case 'cloze': {
          const repairedText = fixInlineLatex(rawDetail.text)
          const stripped = stripAiPreamble(repairedText)
          let nextText = repairedText
          if (stripped.removed) {
            addWarn({
              kind: 'preamble',
              location: dLoc,
              title: `Removed AI preamble from "${title}"`,
              detail: 'Removed leading filler sentence before export.',
              raw: stripped.removed,
            })
            nextText = stripped.cleaned
          }
          scanTextForHintsAndMath(nextText, dLoc, title)
          if (rawDetail.kind === 'bullet' || rawDetail.kind === 'text') {
            const bulletWarn = checkMisplacedBullet(nextText, title, currentSectionTitle)
            if (bulletWarn) {
              addWarn({
                kind: 'integrity',
                location: dLoc,
                title: `Misplaced detail in "${title}"`,
                detail: bulletWarn,
                raw: nextText,
              })
            }
          }
          return { ...rawDetail, text: nextText }
        }
        case 'example': {
          const repairedText = fixInlineLatex(rawDetail.text)
          const repairedTranslation = rawDetail.translation ? fixInlineLatex(rawDetail.translation) : undefined
          const stripped = stripAiPreamble(repairedText)
          let nextText = repairedText
          if (stripped.removed) {
            addWarn({
              kind: 'preamble',
              location: dLoc,
              title: `Removed AI preamble from "${title}"`,
              detail: 'Removed leading filler sentence before export.',
              raw: stripped.removed,
            })
            nextText = stripped.cleaned
          }
          scanTextForHintsAndMath(nextText, dLoc, title)
          if (repairedTranslation) scanTextForHintsAndMath(repairedTranslation, dLoc, title)
          return {
            ...rawDetail,
            text: nextText,
            ...(repairedTranslation !== undefined ? { translation: repairedTranslation } : {}),
          }
        }
        case 'vocab': {
          const term = fixInlineLatex(rawDetail.term)
          const meaning = rawDetail.meaning ? fixInlineLatex(rawDetail.meaning) : ''
          scanTextForHintsAndMath(term, dLoc, title)
          if (meaning) scanTextForHintsAndMath(meaning, dLoc, title)
          return { ...rawDetail, term, meaning }
        }
        case 'question': {
          const front = fixInlineLatex(rawDetail.front)
          const back = fixInlineLatex(rawDetail.back)
          scanTextForHintsAndMath(front, `${dLoc} (question)`, title)
          scanTextForHintsAndMath(back, `${dLoc} (answer)`, title)
          return { ...rawDetail, front, back }
        }
        case 'formula': {
          // Normalize saved raw LaTeX & legacy legend strings at export time
          const repairedLatex = fixInlineLatex(rawDetail.latex)
          const migrated = migrateFormulaDetail({
            ...rawDetail,
            latex: repairedLatex,
            ...(rawDetail.variables ? { variables: fixInlineLatex(rawDetail.variables) } : {}),
          }) as Extract<DetailBlock, { kind: 'formula' }>

          const err = validateLatex(migrated.latex, true)
          if (err) {
            addWarn({
              kind: 'katex',
              location: dLoc,
              title: `Formula KaTeX error in "${title}"`,
              detail: err,
              raw: migrated.latex,
            })
          }
          const sciWarn = checkFormulaScience(migrated.latex, title)
          if (sciWarn) {
            addWarn({
              kind: 'science',
              location: dLoc,
              title: `Verify scientific symbol in "${title}"`,
              detail: sciWarn,
              raw: migrated.latex,
            })
          }

          if (isScalarValueFormula(migrated.latex)) {
            addWarn({
              kind: 'integrity',
              location: dLoc,
              title: `Scalar angle/value shown as formula in "${title}"`,
              detail: `"${migrated.latex}" looks like a boundary angle/scalar value rather than a governing formula.`,
              raw: migrated.latex,
            })
          }

          const topicWarn = checkFormulaBlockTopic(migrated.latex, title, currentSectionTitle)
          if (topicWarn) {
            addWarn({
              kind: 'integrity',
              location: dLoc,
              title: `Misplaced formula in "${title}"`,
              detail: topicWarn,
              raw: migrated.latex,
            })
          }

          const fKey = formulaKey(migrated.latex)
          if (fKey) {
            const firstBlock = seenFormulaBlocks.get(fKey)
            if (firstBlock && normTitle(firstBlock) !== normTitle(title)) {
              addWarn({
                kind: 'integrity',
                location: dLoc,
                title: `Duplicate formula in "${title}"`,
                detail: `Formula "${migrated.latex}" already appears under "${firstBlock}". Each equation should belong to one block.`,
                raw: migrated.latex,
              })
            } else if (!firstBlock) {
              seenFormulaBlocks.set(fKey, title)
            }
          }

          const { entries, fallbackText } = resolveFormulaLegend(migrated)
          if (entries.length === 0 && !fallbackText) {
            addWarn({
              kind: 'integrity',
              location: dLoc,
              title: `Formula missing variable legend in "${title}"`,
              detail: `The formula "${migrated.latex}" has no variable legend explaining its symbols.`,
              raw: migrated.latex,
            })
          }

          for (const entry of entries) {
            const symErr = validateLatex(entry.symbol, false)
            if (symErr) {
              addWarn({
                kind: 'katex',
                location: `${dLoc} (legend symbol)`,
                title: `Legend symbol error in "${title}"`,
                detail: symErr,
                raw: entry.symbol,
              })
            }
            scanTextForHintsAndMath(entry.meaning, `${dLoc} (legend)`, title)
          }
          return migrated
        }
      }
    })

    const cards = item.cards.map((card) => {
      const front = fixInlineLatex(card.front)
      const back = fixInlineLatex(card.back)
      scanTextForHintsAndMath(front, `${location} (card Q)`, title)
      scanTextForHintsAndMath(back, `${location} (card A)`, title)
      return { ...card, front, back }
    })

    const links = item.links.map((link) => {
      const label = fixInlineLatex(link.label)
      const other = fixInlineLatex(link.other)
      scanTextForHintsAndMath(label, `${location} (link)`, title)
      scanTextForHintsAndMath(other, `${location} (link target)`, title)
      return { ...link, label, other }
    })

    return {
      ...item,
      title: cleanTitle,
      summary,
      detailBlocks,
      cards,
      links,
    }
  })

  return { cleanedItems, warnings }
}
