/** Saves a file through the browser (nothing leaves the device). */
export function download(name: string, data: Blob | string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  // Outside an open modal dialog the page is inert, and an inert link loses its file name.
  ;(document.querySelector('dialog[open]') ?? document.body).append(a)
  a.click()
  a.remove()
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A file name from a title: keeps letters of any script, drops characters files cannot have. */
export function fileName(title: string, ext: string): string {
  const base = [...title]
    .map((ch) => ((ch.codePointAt(0) ?? 0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'MyNota'}.${ext}`
}
