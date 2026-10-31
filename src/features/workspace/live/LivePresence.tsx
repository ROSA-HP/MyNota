import { useEffect } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { chapterColor } from '../canvas/visuals'
import { useWorkspace } from '../workspaceStore'
import { openPresence, personColor } from './presence'
import { CURSOR_IDLE_MS, editorOf, usePresence, type PersonInfo } from './presenceStore'

/**
 * Joins the map's people channel while the live documents are open (Phase 6.4): tells the
 * others which block this person is editing, and keeps the list of who is here.
 * Link visitors who have not joined, and maps shown from the device copy, stay out.
 */
export function useLivePresence(mapId: string, userId: string | undefined) {
  const live = useWorkspace((s) => s.mapId === mapId && s.liveStatus !== 'off' && !s.fromCache)

  useEffect(() => {
    if (!live || !userId) return
    const store = usePresence.getState()
    let alive = true
    let loading = false

    const loadPeople = () => {
      if (loading) return
      loading = true
      void supabase.rpc('map_people', { p_map: mapId }).then(({ data }) => {
        loading = false
        if (!alive || !data) return
        const people: Record<string, PersonInfo> = {}
        for (const p of data)
          if (p.kind !== 'invite')
            people[p.user_id] = { name: p.name, username: p.username, avatar_url: p.avatar_url }
        usePresence.getState().setPeople(people)
      })
    }
    loadPeople()

    const link = openPresence(mapId, userId, {
      onPeople: (here) => {
        usePresence.getState().setHere(here)
        // Someone who joined the map after it was opened here: fetch their name.
        const known = usePresence.getState().people
        if (here.some((h) => !known[h.userId])) loadPeople()
      },
      onCursor: (move) => usePresence.getState().moveCursor(move),
    })
    store.setLink(link)

    const sendEditing = () => {
      const ws = useWorkspace.getState()
      link.setEditing(ws.canEdit() ? ws.selectedId : null)
    }
    sendEditing()
    const unsubscribe = useWorkspace.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId || s.role !== prev.role) sendEditing()
    })
    const idle = setInterval(() => usePresence.getState().dropIdle(), CURSOR_IDLE_MS / 3)

    return () => {
      alive = false
      unsubscribe()
      clearInterval(idle)
      link.close()
      usePresence.getState().reset()
    }
  }, [live, mapId, userId])
}

export function personName(p: PersonInfo | undefined): string {
  return p ? p.name.trim() || p.username : '…'
}

/** "Mona is editing": a colored ring and name tag on a block someone else has open. */
export function EditingTag({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation()
  const who = usePresence((s) => editorOf(s.here, nodeId))
  const person = usePresence((s) => (who ? s.people[who.userId] : undefined))
  if (!who) return null
  const c = chapterColor(personColor(who.userId))
  const name = personName(person)
  return (
    <>
      <span
        aria-hidden
        className="mynota-no-export pointer-events-none absolute -inset-[5px] rounded-[14px] border-[2.5px] border-dashed"
        style={{ borderColor: c.strong }}
      />
      <span
        role="status"
        dir="auto"
        className="mynota-no-export pointer-events-none absolute -top-3 start-2 max-w-[90%] truncate rounded-full border-2 border-line px-1.5 text-[11px] leading-[18px] font-bold whitespace-nowrap text-ink"
        style={{ background: c.fill }}
      >
        {t('ws.live.editing', { name })}
      </span>
    </>
  )
}

/** Sends this person's pointer and draws everyone else's (inside <ReactFlow>). */
export function LiveCursors() {
  const cursors = usePresence((s) => s.cursors)
  const people = usePresence((s) => s.people)
  const link = usePresence((s) => s.link)
  const domNode = useStore((s) => s.domNode)
  const { screenToFlowPosition } = useReactFlow()
  const { x, y, zoom } = useViewport()

  useEffect(() => {
    if (!link || !domNode) return
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return // a finger is not a cursor
      link.moveCursor(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    }
    const leave = () => link.moveCursor(null)
    domNode.addEventListener('pointermove', move)
    domNode.addEventListener('pointerleave', leave)
    return () => {
      domNode.removeEventListener('pointermove', move)
      domNode.removeEventListener('pointerleave', leave)
      link.moveCursor(null)
    }
  }, [link, domNode, screenToFlowPosition])

  const list = Object.entries(cursors)
  if (!list.length) return null
  return (
    <div
      aria-hidden
      dir="ltr"
      className="mynota-no-export pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {list.map(([session, cur]) => {
        const c = chapterColor(personColor(cur.userId))
        return (
          <div
            key={session}
            className="absolute top-0 left-0 transition-transform duration-75 ease-linear motion-reduce:transition-none"
            style={{ transform: `translate(${cur.x * zoom + x}px, ${cur.y * zoom + y}px)` }}
          >
            <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-sm">
              <path
                d="M1.5 1.5 L16 9.5 L9.2 11 L6 18 Z"
                fill={c.strong}
                stroke="var(--line)"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            <span
              dir="auto"
              className="ms-3.5 -mt-1 block max-w-40 truncate rounded-md border-2 border-line px-1.5 text-[11px] leading-[18px] font-bold text-ink"
              style={{ background: c.fill }}
            >
              {personName(people[cur.userId])}
            </span>
          </div>
        )
      })}
    </div>
  )
}
