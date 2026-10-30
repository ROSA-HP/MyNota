import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ClipboardPaste,
  FileText,
  Lock,
  Trash,
  Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ExtractProgress } from '@/ai/pipeline/extract'
import type { OcrLanguage } from '@/ai/pipeline/extract/ocr'
import { Button, SelectField } from '@/components/ui'
import { cn } from '@/lib/cn'

export type SourceKind = 'paste' | 'pdf' | 'photos'

const sizeLabel = (bytes: number, lang: string) =>
  new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + ' MB'

export function SourceTabs({
  value,
  onChange,
}: {
  value: SourceKind
  onChange: (s: SourceKind) => void
}) {
  const { t } = useTranslation()
  const tabs: Array<[SourceKind, ReactNode, string]> = [
    ['pdf', <FileText key="i" size={17} aria-hidden />, t('newMap.source.pdf')],
    ['photos', <Camera key="i" size={17} aria-hidden />, t('newMap.source.photos')],
    ['paste', <ClipboardPaste key="i" size={17} aria-hidden />, t('newMap.source.paste')],
  ]
  return (
    <div role="tablist" aria-label={t('newMap.source.label')} className="flex flex-wrap gap-2">
      {tabs.map(([k, icon, label]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={cn(
            'flex h-11 cursor-pointer items-center gap-2 rounded-neo border-2 border-line px-4 text-sm font-semibold',
            value === k ? 'bg-ink text-paper' : 'bg-surface hover:bg-paper-sunken',
          )}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  )
}

function DropZone({
  accept,
  multiple,
  onFiles,
  title,
  hint,
}: {
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  title: string
  hint: string
}) {
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    onFiles([...e.dataTransfer.files])
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-neo-lg border-2 border-dashed px-6 py-10 text-center',
        over ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-muted',
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-neo border-2 border-line bg-ch-sky">
        <Upload size={22} aria-hidden />
      </span>
      <span className="text-base font-bold">{title}</span>
      <span className="text-sm text-ink-muted">{hint}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </label>
  )
}

export function PdfPicker({
  file,
  onFile,
}: {
  file: File | null
  onFile: (f: File | null) => void
}) {
  const { t, i18n } = useTranslation()
  if (!file)
    return (
      <DropZone
        accept="application/pdf,.pdf"
        onFiles={(fs) => fs[0] && onFile(fs[0])}
        title={t('newMap.source.dropPdf')}
        hint={t('newMap.source.pdfLimits')}
      />
    )
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-neo-lg border-2 border-line bg-surface p-4">
      <span className="flex h-14 w-11 items-end justify-center rounded-md border-2 border-line bg-danger-soft pb-1 font-mono text-[10px] font-bold">
        PDF
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span dir="auto" className="truncate font-bold">
          {file.name}
        </span>
        <span className="text-sm text-ink-muted">{sizeLabel(file.size, i18n.language)}</span>
      </span>
      <Button variant="secondary" size="sm" onClick={() => onFile(null)}>
        {t('newMap.source.change')}
      </Button>
    </div>
  )
}

export function PhotoPicker({
  photos,
  onPhotos,
}: {
  photos: File[]
  onPhotos: (fs: File[]) => void
}) {
  const { t } = useTranslation()
  const urls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  const move = (i: number, d: -1 | 1) => {
    const next = [...photos]
    const [f] = next.splice(i, 1)
    if (f) next.splice(i + d, 0, f)
    onPhotos(next)
  }
  return (
    <div className="flex flex-col gap-3">
      <DropZone
        accept="image/jpeg,image/png,image/webp"
        multiple
        onFiles={(fs) =>
          // New photos go after the ones already added, in file-name order (IMG_2 before IMG_10).
          onPhotos([
            ...photos,
            ...[...fs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
          ])
        }
        title={t('newMap.source.dropPhotos')}
        hint={t('newMap.source.photoLimits')}
      />
      {photos.length > 0 && (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
          {photos.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex flex-col gap-1.5 rounded-neo border-2 border-line bg-surface p-1.5"
            >
              <span className="relative block aspect-[3/4] overflow-hidden rounded-md bg-paper-sunken">
                <img src={urls[i]} alt="" className="size-full object-cover" />
                <span className="absolute start-1 top-1 rounded-md border-[1.5px] border-line bg-surface px-1.5 font-mono text-[11px] font-bold">
                  {i + 1}
                </span>
              </span>
              <span className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label={t('newMap.source.moveEarlier')}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-paper-sunken disabled:opacity-30"
                >
                  <ArrowLeft size={15} aria-hidden className="rtl:-scale-x-100" />
                </button>
                <button
                  type="button"
                  aria-label={t('newMap.source.removePhoto')}
                  onClick={() => onPhotos(photos.filter((_, j) => j !== i))}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-md text-danger hover:bg-paper-sunken"
                >
                  <Trash size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t('newMap.source.moveLater')}
                  disabled={i === photos.length - 1}
                  onClick={() => move(i, 1)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-paper-sunken disabled:opacity-30"
                >
                  <ArrowRight size={15} aria-hidden className="rtl:-scale-x-100" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function OcrLanguageSelect({
  value,
  onChange,
  forPhotos,
}: {
  value: OcrLanguage
  onChange: (v: OcrLanguage) => void
  forPhotos: boolean
}) {
  const { t } = useTranslation()
  return (
    <SelectField
      label={forPhotos ? t('newMap.source.ocrLanguagePhotos') : t('newMap.source.ocrLanguagePdf')}
      value={value}
      onChange={(e) => onChange(e.target.value as OcrLanguage)}
      className="max-w-sm"
      options={[
        { value: 'en', label: 'English', lang: 'en' },
        { value: 'de', label: 'Deutsch', lang: 'de' },
        { value: 'ar', label: 'العربية', lang: 'ar' },
        { value: 'mixed', label: t('newMap.source.ocrMixed') },
      ]}
    />
  )
}

function Bar({
  label,
  done,
  total,
  tone,
}: {
  label: string
  done: number
  total: number
  tone: string
}) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-sm font-semibold">
        <span>{label}</span>
        <span className="font-mono text-xs font-bold" dir="ltr">
          {done} / {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-3.5 overflow-hidden rounded-full border-2 border-line bg-paper-sunken"
      >
        <div className={cn('h-full transition-[width]', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ExtractProgressPanel({
  progress,
  photos,
  onCancel,
}: {
  progress: ExtractProgress
  photos: boolean
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="flex flex-col gap-4 rounded-neo-lg border-2 border-line bg-surface p-5 outline-none neo-shadow"
    >
      {!photos && (
        <Bar
          label={t('newMap.source.reading')}
          done={progress.read}
          total={progress.total}
          tone="bg-brand"
        />
      )}
      {progress.ocrTotal > 0 && (
        <Bar
          label={photos ? t('newMap.source.ocrPhotos') : t('newMap.source.ocrScanned')}
          done={progress.ocrDone}
          total={progress.ocrTotal}
          tone="bg-ch-sky"
        />
      )}
      {progress.ocrTotal > 0 && (
        <p className="text-sm text-ink-muted">{t('newMap.source.ocrHint')}</p>
      )}
      <Button variant="ghost" size="sm" className="self-end" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}

export function DevicePrivacyNote() {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-3 rounded-neo-lg border-2 border-line bg-brand-soft p-3.5 text-sm leading-relaxed text-ink">
      <Lock size={18} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        <strong>{t('newMap.source.stayTitle')}</strong> {t('newMap.source.stayBody')}
      </span>
    </div>
  )
}
