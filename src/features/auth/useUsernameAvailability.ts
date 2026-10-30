import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { USERNAME_PATTERN } from './schemas'

export type Availability = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error'

/** Debounced check against the username_available() database function. */
export function useUsernameAvailability(username: string, current?: string): Availability {
  const [result, setResult] = useState<{
    username: string
    value: 'available' | 'taken' | 'error'
  } | null>(null)
  const needsCheck = Boolean(username) && username !== current && USERNAME_PATTERN.test(username)

  useEffect(() => {
    if (!needsCheck) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { candidate: username })
      if (!cancelled) setResult({ username, value: error ? 'error' : data ? 'available' : 'taken' })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [username, needsCheck])

  if (!username || username === current) return 'idle'
  if (!USERNAME_PATTERN.test(username)) return 'invalid'
  return result?.username === username ? result.value : 'checking'
}
