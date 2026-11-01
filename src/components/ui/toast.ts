import { create } from 'zustand'
import { motionMs } from '@/lib/motion'

export type ToastTone = 'info' | 'success' | 'danger'
export interface Toast {
  id: number
  message: string
  tone: ToastTone
  /** Playing its way-out animation; removed a moment later. */
  leaving?: boolean
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = nextId++
    // The same message twice replaces the first one instead of stacking.
    const others = get().toasts.filter(
      (t) => !t.leaving && !(t.message === message && t.tone === tone),
    )
    set({ toasts: [...others.slice(-2), { id, message, tone }] })
    setTimeout(() => get().dismiss(id), 4500)
  },
  dismiss: (id) => {
    if (!get().toasts.some((t) => t.id === id && !t.leaving)) return
    set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), motionMs(180))
  },
}))

export const toast = (message: string, tone?: ToastTone) => useToasts.getState().push(message, tone)
