/**
 * Text normalisation for search: case, accents and the Arabic spelling variants students type
 * interchangeably, so "Zellatmung", "zellatmung" and "التنفس" / "التنفّس" all match.
 */
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g

export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '') // Latin accents (decomposed above)
    .replace(ARABIC_MARKS, '') // tashkeel, superscript alef, Quranic marks
    .replace(TATWEEL, '')
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي') // ئ → ي
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every word of the query appears in the text (any order). */
export function matchesQuery(text: string, query: string): boolean {
  const hay = normalizeForSearch(text)
  return normalizeForSearch(query)
    .split(' ')
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

/** Everything a block says (title, summary, details) as one text to match against. */
export function nodeSearchText(n: {
  title: string
  summary: string
  details: ReadonlyArray<Record<string, unknown>>
}): string {
  const parts = [n.title, n.summary]
  for (const d of n.details)
    for (const [k, v] of Object.entries(d)) if (k !== 'kind' && typeof v === 'string') parts.push(v)
  return parts.join(' ')
}
