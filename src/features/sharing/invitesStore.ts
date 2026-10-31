import { create } from 'zustand'
import type { MyInviteRow } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

interface InvitesState {
  invites: MyInviteRow[]
  loadedAt: number
  /** Refreshes unless the last load is fresher than `maxAgeMs`. */
  load: (maxAgeMs?: number) => Promise<void>
  /** Accept (returns the map id) or decline an invite. */
  respond: (inviteId: string, accept: boolean) => Promise<string>
}

/** Invites waiting for the student's answer (Home, Library, sidebar badge). */
export const useInvites = create<InvitesState>((set, get) => ({
  invites: [],
  loadedAt: 0,
  load: async (maxAgeMs = 0) => {
    if (get().loadedAt && Date.now() - get().loadedAt < maxAgeMs) return
    const { data, error } = await supabase.rpc('my_invites')
    // Before the Phase 5 migration (or offline) there are simply no invites to show.
    set({ invites: error ? get().invites : data, loadedAt: Date.now() })
  },
  respond: async (inviteId, accept) => {
    const { data, error } = await supabase.rpc('invite_respond', {
      p_invite: inviteId,
      p_accept: accept,
    })
    if (error) throw error
    set({ invites: get().invites.filter((i) => i.invite_id !== inviteId) })
    return data
  },
}))
