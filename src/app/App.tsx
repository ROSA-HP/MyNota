import { useEffect } from 'react'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from '@/components/ui'
import { useAuth } from '@/features/auth/authStore'
import { router } from './router'

export function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => init(), [init])
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
}
