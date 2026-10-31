import { Check, MailOpen, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, toast } from '@/components/ui'
import { COVER } from '@/features/library/mapBits'
import { cn } from '@/lib/cn'
import { shareError } from './shareApi'
import { useInvites } from './invitesStore'

/** "Waiting for your answer": invites to other people's maps, with Accept / Decline. */
export function InvitesPanel({ onAccepted }: { onAccepted?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const invites = useInvites((s) => s.invites)
  const [busy, setBusy] = useState<string | null>(null)
  if (!invites.length) return null

  const answer = async (id: string, accept: boolean) => {
    setBusy(id)
    try {
      const mapId = await useInvites.getState().respond(id, accept)
      if (accept) {
        toast(t('invites.accepted'), 'success')
        onAccepted?.()
        navigate(`/maps/${mapId}`)
      } else toast(t('invites.declined'), 'info')
    } catch (e) {
      toast(t(shareError(e as { code?: string })), 'danger')
      void useInvites.getState().load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      aria-labelledby="invites-h"
      className="flex flex-col gap-3 rounded-neo-lg border-2 border-line bg-brand-soft/40 p-4 sm:p-5"
    >
      <h2 id="invites-h" className="flex items-center gap-2 text-lg font-bold">
        <MailOpen size={19} aria-hidden />
        {t('invites.title', { count: invites.length })}
      </h2>
      <ul className="flex flex-col gap-2">
        {invites.map((i) => (
          <li
            key={i.invite_id}
            className="flex flex-wrap items-center gap-3 rounded-neo border-2 border-line bg-surface px-3 py-2.5"
          >
            <span
              aria-hidden
              className={cn(
                'size-4 shrink-0 rounded-full border-2 border-line',
                COVER[i.cover_color],
              )}
            />
            <span className="flex min-w-0 flex-1 basis-56 flex-col">
              <span dir="auto" className="truncate font-bold">
                {i.map_title}
              </span>
              <span className="text-sm text-ink-muted">
                {t('invites.from', {
                  name: '⁨' + (i.inviter_name || `@${i.inviter_username ?? ''}`) + '⁩',
                  role: t(`share.roles.${i.role}`),
                })}
              </span>
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon={<X size={16} aria-hidden />}
                disabled={busy === i.invite_id}
                onClick={() => void answer(i.invite_id, false)}
              >
                {t('invites.decline')}
              </Button>
              <Button
                size="sm"
                icon={<Check size={16} aria-hidden />}
                loading={busy === i.invite_id}
                onClick={() => void answer(i.invite_id, true)}
              >
                {t('invites.accept')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
