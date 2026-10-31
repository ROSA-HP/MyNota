import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { ProfileRow } from '@/lib/database.types'
import { PROFILE_COLUMNS, supabase } from '@/lib/supabase'
import { useAiKey } from '@/features/settings/aiKeyStore'
import { assurance } from './mfa'
import { usePreferences } from '@/features/settings/preferencesStore'

type Status = 'loading' | 'signedOut' | 'signedIn'

interface AuthState {
  status: Status
  session: Session | null
  profile: ProfileRow | null
  /** Set when the user was signed out for a reason we should explain (e.g. suspension). */
  notice: 'suspended' | null
  /** True after following a password-reset link. */
  recovering: boolean
  /** Signed in with a password or Google, but the account's authenticator code is still due. */
  mfaNeeded: boolean
  /** This session passed the second factor (required for the admin area). */
  mfaVerified: boolean
  refreshAssurance: () => Promise<void>
  init: () => () => void
  refreshProfile: () => Promise<void>
  setProfile: (profile: ProfileRow) => void
  signOut: () => Promise<void>
  clearNotice: () => void
}

let initialized = false

export const useAuth = create<AuthState>((set, get) => {
  async function loadProfile(session: Session): Promise<void> {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', session.user.id)
      .single()

    if (error || !data) {
      // Keep the session; pages show a retry. Profile rows are created by a trigger, so a
      // missing row is a transient/network problem rather than a normal state.
      set({ status: 'signedIn', session, profile: null })
      return
    }
    if (data.status !== 'active') {
      await supabase.auth.signOut()
      set({ status: 'signedOut', session: null, profile: null, notice: 'suspended' })
      return
    }
    const isFirstLoad = get().profile?.id !== data.id
    const a = await assurance()
    set({
      status: 'signedIn',
      session,
      profile: data,
      mfaNeeded: a.needed,
      mfaVerified: a.verified,
    })
    if (isFirstLoad) {
      usePreferences.getState().adoptFromProfile(data)
      void useAiKey.getState().load(data.id)
    }
  }

  return {
    status: 'loading',
    session: null,
    profile: null,
    notice: null,
    recovering: false,
    mfaNeeded: false,
    mfaVerified: false,

    init: () => {
      if (initialized) return () => undefined
      initialized = true

      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) void loadProfile(data.session)
        else set({ status: 'signedOut' })
      })

      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // Supabase advises against awaiting other client calls inside this callback.
        setTimeout(() => {
          if (event === 'PASSWORD_RECOVERY') set({ recovering: true })
          if (!session) {
            useAiKey.getState().clearMemory()
            set({ status: 'signedOut', session: null, profile: null, recovering: false })
            return
          }
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
            if (get().profile?.id === session.user.id) set({ session })
            else void loadProfile(session)
          } else {
            set({ session })
            if (event === 'MFA_CHALLENGE_VERIFIED' || event === 'TOKEN_REFRESHED')
              void get().refreshAssurance()
          }
        }, 0)
      })

      return () => {
        data.subscription.unsubscribe()
        initialized = false
      }
    },

    refreshProfile: async () => {
      const session = get().session
      if (session) await loadProfile(session)
    },

    refreshAssurance: async () => {
      const a = await assurance()
      set({ mfaNeeded: a.needed, mfaVerified: a.verified })
    },

    setProfile: (profile) => set({ profile }),

    signOut: async () => {
      useAiKey.getState().clearMemory()
      await supabase.auth.signOut()
      set({
        status: 'signedOut',
        session: null,
        profile: null,
        recovering: false,
        mfaNeeded: false,
        mfaVerified: false,
      })
    },

    clearNotice: () => set({ notice: null }),
  }
})
