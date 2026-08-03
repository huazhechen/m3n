import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'

const HomePage = lazy(() => import('./pages/HomePage').then(({ HomePage: Page }) => ({ default: Page })))
const EditorPage = lazy(() => import('./pages/EditorPage').then(({ EditorPage: Page }) => ({ default: Page })))
const ScoresPage = lazy(() => import('./pages/ScoresPage').then(({ ScoresPage: Page }) => ({ default: Page })))
const ScoreReaderPage = lazy(() => import('./pages/ScoreReaderPage').then(({ ScoreReaderPage: Page }) => ({ default: Page })))
const DocsPage = lazy(() => import('./pages/DocsPage').then(({ DocsPage: Page }) => ({ default: Page })))

export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<div className="page-status" role="status">正在加载...</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/reader" element={<ScoreReaderPage />} />
          <Route path="/scores" element={<ScoresPage />} />
          <Route path="/scores/:slug" element={<ScoreReaderPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  )
}
