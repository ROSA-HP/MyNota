import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, TextField, toast } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { DEFAULT_LIMITS, loadLimits } from '@/features/study/limits'
import { supabase } from '@/lib/supabase'

/** The same ranges as the database check constraints. */
const MAX_NEW = 500
const MAX_REVIEWS = 5000

function parseLimit(v: string, max: number): number | null {
  if (!/^\d{1,4}$/.test(v.trim())) return null
  const n = Number(v)
  return n >= 0 && n <= max ? n : null
}

/** Daily limits for new cards and reviews (Settings › Study). */
export function StudySection() {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.session?.user.id)
  const [saved, setSaved] = useState<{ n: number; r: number } | null>(null)
  const [newLimit, setNewLimit] = useState('')
  const [reviewLimit, setReviewLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!userId) return
    let alive = true
    void loadLimits(userId).then((l) => {
      if (!alive) return
      setSaved({ n: l.daily_new_limit, r: l.daily_review_limit })
      setNewLimit(String(l.daily_new_limit))
      setReviewLimit(String(l.daily_review_limit))
    })
    return () => {
      alive = false
    }
  }, [userId])

  const n = parseLimit(newLimit, MAX_NEW)
  const r = parseLimit(reviewLimit, MAX_REVIEWS)
  const dirty = saved !== null && (n !== saved.n || r !== saved.r)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!userId || n === null || r === null) return
    setSaving(true)
    setFailed(false)
    const { error } = await supabase
      .from('profiles')
      .update({ daily_new_limit: n, daily_review_limit: r })
      .eq('id', userId)
    setSaving(false)
    if (error) return setFailed(true)
    setSaved({ n, r })
    toast(t('common.saved'), 'success')
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {failed && <Alert tone="danger">{t('settings.study.failed')}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={t('settings.study.newLabel')}
          inputMode="numeric"
          ltr
          value={newLimit}
          placeholder={String(DEFAULT_LIMITS.daily_new_limit)}
          onChange={(e) => setNewLimit(e.target.value)}
          hint={t('settings.study.newHint', { max: MAX_NEW })}
          error={newLimit && n === null ? t('settings.study.range', { max: MAX_NEW }) : null}
        />
        <TextField
          label={t('settings.study.reviewLabel')}
          inputMode="numeric"
          ltr
          value={reviewLimit}
          placeholder={String(DEFAULT_LIMITS.daily_review_limit)}
          onChange={(e) => setReviewLimit(e.target.value)}
          hint={t('settings.study.reviewHint')}
          error={reviewLimit && r === null ? t('settings.study.range', { max: MAX_REVIEWS }) : null}
        />
      </div>
      <div>
        <Button type="submit" loading={saving} disabled={!dirty || n === null || r === null}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}
