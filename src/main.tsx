import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import '@/lib/i18n'
import { App } from '@/app/App'
import { installErrorReporting } from '@/lib/errors/report'

installErrorReporting()

const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
