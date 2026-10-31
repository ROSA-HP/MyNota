import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/app/Avatar'
import { buttonClasses } from '@/components/ui'
import { chapterColor } from '@/features/workspace/canvas/visuals'
import { personColor } from '@/features/workspace/live/presence'
import { usePresence } from '@/features/workspace/live/presenceStore'
import { useWorkspace } from '@/features/workspace/workspaceStore'
import { ShareDialog } from './ShareDialog'
import { usePeople } from './usePeople'

/** Top-bar avatars of the people on the map, and the Share button. */
export function ShareControls({ mapId }: { mapId: string }) {
  const { t } = useTranslation()
  const role = useWorkspace((s) => s.role)
  const title = useWorkspace((s) => s.map?.title ?? '')
  const fromCache = useWorkspace((s) => s.fromCache)
  const [open, setOpen] = useState(false)
  const { people, reload } = usePeople(fromCache ? null : mapId)
  const here = usePresence((s) => s.here)
  const hereIds = new Set(here.map((h) => h.userId))
  // People who have the map open right now come first, with a ring in their cursor color.
  const onMap = (people ?? [])
    .filter((p) => p.kind !== 'invite')
    .sort((a, b) => Number(hereIds.has(b.user_id)) - Number(hereIds.has(a.user_id)))
  const shown = onMap.slice(0, 4)
  const label = (p: (typeof onMap)[number]) =>
    (p.name || p.username) + (hereIds.has(p.user_id) ? ` (${t('ws.live.hereNow')})` : '')

  return (
    <>
      {onMap.length > 1 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('share.peopleOnMap', { count: onMap.length })}
          title={onMap.map(label).join(', ')}
          className="hidden cursor-pointer items-center rounded-full ps-1 md:flex"
        >
          {shown.map((p) => (
            <span
              key={p.user_id}
              className="-ms-2 rounded-full first:ms-0"
              style={
                hereIds.has(p.user_id)
                  ? {
                      boxShadow: `0 0 0 2.5px ${chapterColor(personColor(p.user_id)).strong}`,
                    }
                  : undefined
              }
            >
              <Avatar name={p.name} username={p.username} url={p.avatar_url} size={30} />
            </span>
          ))}
          {onMap.length > shown.length && (
            <span className="-ms-2 flex size-[30px] items-center justify-center rounded-full border-2 border-line bg-surface text-xs font-bold tabular-nums">
              +{onMap.length - shown.length}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={fromCache}
        className={buttonClasses({
          size: 'sm',
          variant: role === 'owner' ? 'primary' : 'secondary',
        })}
      >
        <Share2 size={16} aria-hidden />
        <span className="hidden lg:inline">{t('ws.share')}</span>
      </button>
      <ShareDialog
        open={open}
        onClose={() => {
          setOpen(false)
          reload()
        }}
        mapId={mapId}
        mapTitle={title}
        role={role}
      />
    </>
  )
}
