import { normalizeForSearch } from '@/lib/searchText'

/**
 * Marks where the query's words occur in `text`, matching the way search matches (case, accents,
 * Arabic diacritics and spelling variants ignored). Each normalized character remembers which
 * original character it came from, so the marks land on the original text.
 */
export function matchRanges(text: string, query: string): Array<[number, number]> {
  const words = normalizeForSearch(query)
    .split(' ')
    .filter((w) => w.length > 0)
  if (!words.length) return []
  let norm = ''
  const from: number[] = []
  let i = 0
  for (const ch of text) {
    const n = /\s/.test(ch) ? ' ' : normalizeForSearch(ch)
    for (let k = 0; k < n.length; k++) from.push(i)
    norm += n
    i += ch.length
  }
  const ranges: Array<[number, number]> = []
  for (const w of words) {
    let at = norm.indexOf(w)
    while (at >= 0) {
      const start = from[at] ?? 0
      const lastFrom = from[at + w.length - 1] ?? start
      let end = lastFrom + ((text.codePointAt(lastFrom) ?? 0) > 0xffff ? 2 : 1)
      // Keep marks that sit on the last letter (Arabic tashkeel) inside the highlight.
      while (
        end < text.length &&
        !/\s/.test(text[end] ?? ' ') &&
        !normalizeForSearch(text[end] ?? '')
      )
        end += 1
      ranges.push([start, end])
      at = norm.indexOf(w, at + w.length)
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged.at(-1)
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

export function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = matchRanges(text, query)
  if (!ranges.length) return <>{text}</>
  const out: React.ReactNode[] = []
  let pos = 0
  ranges.forEach(([s, e], k) => {
    if (s > pos) out.push(text.slice(pos, s))
    out.push(
      <mark key={k} className="rounded-sm bg-ch-yellow px-0.5 text-ink">
        {text.slice(s, e)}
      </mark>,
    )
    pos = e
  })
  if (pos < text.length) out.push(text.slice(pos))
  return <>{out}</>
}
