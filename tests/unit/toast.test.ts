import { describe, expect, it } from 'vitest'
import { toast, useToasts } from '@/components/ui/toast'

describe('toasts', () => {
  it('shows the same message once, and at most three', () => {
    useToasts.setState({ toasts: [] })
    toast('Saved')
    toast('Saved')
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['Saved'])
    toast('Saved', 'danger') // a different tone is a different message
    toast('A')
    toast('B')
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['Saved', 'A', 'B'])
  })
})
