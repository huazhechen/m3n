import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

const Router = import.meta.env.VITE_OFFLINE ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router basename={import.meta.env.VITE_OFFLINE ? undefined : import.meta.env.BASE_URL}>
      <App />
    </Router>
  </StrictMode>,
)
