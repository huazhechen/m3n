import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { recoverModuleLoad } from './lib/module-recovery'

window.addEventListener('vite:preloadError', event => {
  try { recoverModuleLoad(event, window.sessionStorage, () => window.location.reload(), import.meta.url) } catch { /* Keep the error UI when storage is unavailable. */ }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
