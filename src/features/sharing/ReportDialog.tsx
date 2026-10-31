import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Dialog, toast } from '@/components/ui'
import { controlClasses } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import type { ReportReason } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { shareError } from './shareApi'

const REASONS: ReportReason[] = ['spam', 'inappropriate', 'copyright', 'harmful', 'other']

/** Report a shared map (by its id when on it, or through its share link). */
export function ReportDialog({
  open,
  onClose,
  target,
}: {
  open: boolean
  onClose: () => void
  target: { mapId: string } | { token: string }
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!reason) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('report_map', {
      p_reason: reason,
      p_details: details.trim(),
      ...('token' in target ? { p_token: target.token } : { p_map: target.mapId }),
    })
    setBusy(false)
    if (err)
      return setError(
        err.code === 'MN409'
          ? t('report.already')
          : err.code === 'MN400'
            ? t('report.ownMap')
            : t(shareError(err)),
      )
    toast(t('report.sent'), 'success')
    setReason(null)
    setDetails('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('report.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void send()} loading={busy} disabled={!reason}>
            {t('report.send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{t('report.body')}</p>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold">{t('report.reason')}</legend>
          {REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-neo border-2 px-3',
                reason === r
                  ? 'border-line bg-danger-soft'
                  : 'border-line-soft hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="report-reason"
                checked={reason === r}
                onChange={() => setReason(r)}
                className="size-4 accent-[var(--danger)]"
              />
              <span className="text-sm font-semibold">{t(`report.reasons.${r}`)}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t('report.details')}
          <textarea
            dir="auto"
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className={cn(controlClasses(), 'min-h-20 py-2 font-normal')}
          />
        </label>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  )
}
