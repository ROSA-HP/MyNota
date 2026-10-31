import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/app/Avatar'
import { buttonClasses } from '@/components/ui'
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
  const onMap = (people ?? []).filter((p) => p.kind !== 'invite')
  const shown = onMap.slice(0, 4)

  return (
    <>
      {onMap.length > 1 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('share.peopleOnMap', { count: onMap.length })}
          title={onMap.map((p) => p.name || p.username).join(', ')}
          className="hidden cursor-pointer items-center rounded-full ps-1 md:flex"
        >
          {shown.map((p) => (
            <span key={p.user_id} className="-ms-2 first:ms-0">
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
