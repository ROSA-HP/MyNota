import type { CSSProperties } from 'react'
import { splitInlineMath } from '@/components/ui/inlineMath'
import { validateLatex } from '@/components/ui/MathFormula'
import { resolveFormulaLegend } from '@/lib/formulaLegend'
import type { DetailBlock } from '@/lib/database.types'
import type { OutlineItem } from '../outline'

export type ExportWarningKind = 'preamble' | 'katex' | 'science' | 'typo'

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

function checkFormulaScience(latex: string, contextText: string): string | null {
  const compact = latex.replace(/\s+/g, '')
  // Flag u_E assigned to magnetic field term B^2 / (2 mu_0) without E^2
  if (
    /u_\{?E\}?\s*=/.test(compact) &&
    /B\^?\{?2\}?\s*\/\s*\(?2\\?(?:mu_?\{?0\}?|μ₀)/.test(compact) &&
    !/E\^?\{?2\}?/.test(compact)
  ) {
    return `Formula uses u_E alongside B^2 / (2\\mu_0)${contextText ? ` in "${contextText}"` : ''}; u_B may be intended for magnetic energy density.`
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
    const key = `${w.kind}:${w.location}:${w.raw ?? w.detail}`
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

  const cleanedItems = items.map((item) => {
    const title = item.title || 'Untitled'
    const location = `${item.level}: ${title}`

    scanTextForHintsAndMath(item.title, location, title)

    let summary = item.summary
    if (summary) {
      const stripped = stripAiPreamble(summary)
      if (stripped.removed) {
        addWarn({
          kind: 'preamble',
          location,
          title: `Removed AI preamble from "${title}" summary`,
          detail: `Removed leading filler sentence before export.`,
          raw: stripped.removed,
        })
        summary = stripped.cleaned
      }
      scanTextForHintsAndMath(summary, `${location} (summary)`, title)
    }

    const detailBlocks: DetailBlock[] = item.detailBlocks.map((detail, idx) => {
      const dLoc = `${location} · detail #${idx + 1}`
      switch (detail.kind) {
        case 'text':
        case 'bullet':
        case 'cloze': {
          const stripped = stripAiPreamble(detail.text)
          let nextText = detail.text
          if (stripped.removed) {
            addWarn({
              kind: 'preamble',
              location: dLoc,
              title: `Removed AI preamble from "${title}"`,
              detail: `Removed leading filler sentence before export.`,
              raw: stripped.removed,
            })
            nextText = stripped.cleaned
          }
          scanTextForHintsAndMath(nextText, dLoc, title)
          return { ...detail, text: nextText }
        }
        case 'example': {
          const stripped = stripAiPreamble(detail.text)
          let nextText = detail.text
          if (stripped.removed) {
            addWarn({
              kind: 'preamble',
              location: dLoc,
              title: `Removed AI preamble from "${title}"`,
              detail: `Removed leading filler sentence before export.`,
              raw: stripped.removed,
            })
            nextText = stripped.cleaned
          }
          scanTextForHintsAndMath(nextText, dLoc, title)
          if (detail.translation) scanTextForHintsAndMath(detail.translation, dLoc, title)
          return { ...detail, text: nextText }
        }
        case 'vocab': {
          scanTextForHintsAndMath(detail.term, dLoc, title)
          if (detail.meaning) scanTextForHintsAndMath(detail.meaning, dLoc, title)
          return detail
        }
        case 'question': {
          scanTextForHintsAndMath(detail.front, `${dLoc} (question)`, title)
          scanTextForHintsAndMath(detail.back, `${dLoc} (answer)`, title)
          return detail
        }
        case 'formula': {
          const err = validateLatex(detail.latex, true)
          if (err) {
            addWarn({
              kind: 'katex',
              location: dLoc,
              title: `Formula KaTeX error in "${title}"`,
              detail: err,
              raw: detail.latex,
            })
          }
          const sciWarn = checkFormulaScience(detail.latex, title)
          if (sciWarn) {
            addWarn({
              kind: 'science',
              location: dLoc,
              title: `Verify scientific symbol in "${title}"`,
              detail: sciWarn,
              raw: detail.latex,
            })
          }
          const { entries } = resolveFormulaLegend(detail)
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
          return detail
        }
      }
    })

    for (const card of item.cards) {
      scanTextForHintsAndMath(card.front, `${location} (card Q)`, title)
      scanTextForHintsAndMath(card.back, `${location} (card A)`, title)
    }

    for (const link of item.links) {
      scanTextForHintsAndMath(link.label, `${location} (link)`, title)
      scanTextForHintsAndMath(link.other, `${location} (link target)`, title)
    }

    return {
      ...item,
      summary,
      detailBlocks,
    }
  })

  return { cleanedItems, warnings }
}
