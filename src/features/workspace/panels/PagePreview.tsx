import { useEffect, useRef, useState } from 'react'
import { FileImage } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import type { SourceRow } from '@/lib/database.types'
import { localDb, type StoredFile } from '@/lib/localdb'

/** Rendered pages, by file hash + page, so flipping between blocks is instant. */
const pageCache = new Map<string, string>()
/** Open PDFs by file hash (opening a 300-page book once is enough). */
const docCache = new Map<string, Promise<import('pdfjs-dist').PDFDocumentProxy>>()

async function pageImage(file: StoredFile, page: number): Promise<string | null> {
  const cacheKey = `${file.hash}:${page}`
  const cached = pageCache.get(cacheKey)
  if (cached) return cached
  let url: string | null
  if (file.type === 'application/pdf') {
    const blob = file.blobs[0]
    if (!blob) return null
    const { openPdf, renderPage } = await import('@/ai/pipeline/extract/pdf')
    let doc = docCache.get(file.hash)
    if (!doc) {
      doc = blob.arrayBuffer().then(openPdf)
      docCache.set(file.hash, doc)
    }
    const canvas = await renderPage(await doc, page, { width: 640 })
    url = canvas.toDataURL('image/png')
    canvas.width = canvas.height = 0
  } else {
    const blob = file.blobs[page - 1]
    url = blob ? URL.createObjectURL(blob) : null
  }
  if (url) pageCache.set(cacheKey, url)
  return url
}

/**
 * Page previews for a block's source, read from the original file kept on this device
 * (uploads never leave the device). On another device it says where the pages are.
 */
export function PagePreview({ source, pages }: { source: SourceRow; pages: number[] }) {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.session?.user.id)
  const [file, setFile] = useState<StoredFile | null | undefined>(undefined)
  const [page, setPage] = useState<number | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const wanted = useRef<number | null>(null)

  useEffect(() => {
    if (!userId || !source.file_hash) return
    let cancelled = false
    localDb.files
      .get(`${userId}:${source.file_hash}`)
      .then((f) => !cancelled && setFile(f ?? null))
      .catch(() => !cancelled && setFile(null))
    return () => {
      cancelled = true
    }
  }, [userId, source.file_hash])

  /** Shows (or hides) one page; renders it from the device copy the first time. */
  function toggle(p: number) {
    if (!file || page === p) {
      setPage(null)
      return
    }
    setPage(p)
    setLoading(true)
    wanted.current = p
    // Only the last page asked for is shown (quick clicks may finish out of order).
    const done = (url: string | null) => {
      if (wanted.current !== p) return
      setImage(url)
      setLoading(false)
    }
    pageImage(file, p).then(done, () => done(null))
  }

  if (!source.file_hash || !pages.length) return null
  if (file === null)
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <FileImage size={14} aria-hidden />
        {t('ws.panel.pageElsewhere', {
          pages: pages.map((p) => t('ws.panel.pageShort', { n: p })).join(', '),
        })}
      </p>
    )
  if (!file) return null
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t('ws.panel.pages')}
      >
        <FileImage size={15} aria-hidden className="text-ink-muted" />
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={page === p}
            onClick={() => toggle(p)}
            className={cn(
              'min-h-8 cursor-pointer rounded-full border-2 border-line px-2.5 font-mono text-xs font-bold',
              page === p ? 'bg-ink text-paper' : 'bg-surface hover:bg-paper-sunken',
            )}
          >
            {t('ws.panel.pageShort', { n: p })}
          </button>
        ))}
      </div>
      {page !== null && (
        <div className="flex min-h-24 items-center justify-center overflow-hidden rounded-neo border-2 border-line bg-white">
          {loading ? (
            <Spinner size={20} />
          ) : image ? (
            <img
              src={image}
              alt={t('ws.panel.pageAlt', { n: page, name: file.name })}
              className="block h-auto w-full"
            />
          ) : (
            <p className="p-3 text-sm text-ink-muted">{t('ws.panel.pageFailed')}</p>
          )}
        </div>
      )}
    </div>
  )
}
