import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initializeCatalog } from './lib/samples'

initializeCatalog().then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)).catch(() => {
  const root = document.getElementById('root')!
  root.textContent = '曲库加载失败，请检查网络后重试。'
  const retry = document.createElement('button')
  retry.textContent = '重新加载'
  retry.onclick = () => location.reload()
  root.append(retry)
})
