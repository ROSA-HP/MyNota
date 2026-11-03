import { useEffect } from 'react'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { useThemeShortcut } from '@/features/settings/ThemeToggle'
import { router } from './router'

export function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => init(), [init])
  useThemeShortcut()
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
}
