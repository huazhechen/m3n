import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { pruneExpiredLocalScores } from './lib/local-scores'
import { pruneExpiredSimulatedSubmissions } from './lib/simulated-submissions'

const HomePage = lazy(() => import('./pages/HomePage').then(({ HomePage: Page }) => ({ default: Page })))
const EditorPage = lazy(() => import('./pages/EditorPage').then(({ EditorPage: Page }) => ({ default: Page })))
const ScoresPage = lazy(() => import('./pages/ScoresPage').then(({ ScoresPage: Page }) => ({ default: Page })))
const ScoreReaderPage = lazy(() => import('./pages/ScoreReaderPage').then(({ ScoreReaderPage: Page }) => ({ default: Page })))
const DocsPage = lazy(() => import('./pages/DocsPage').then(({ DocsPage: Page }) => ({ default: Page })))
const ConverterPage = lazy(() => import('./pages/ConverterPage').then(({ ConverterPage: Page }) => ({ default: Page })))

function isH123Host() {
  return typeof window !== 'undefined' && window.location.hostname.split('.')[0]?.toLowerCase() === 'h123'
}

export default function App() {
  useEffect(() => {
    pruneExpiredLocalScores()
    pruneExpiredSimulatedSubmissions()
  }, [])
  return (
    <AppErrorBoundary>
      <Suspense fallback={<div className="page-status" role="status">正在加载...</div>}>
        {isH123Host() ? (
          <Routes><Route path="*" element={<ConverterPage />} /></Routes>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/editor/:scoreId?" element={<EditorPage />} />
            <Route path="/scores" element={<ScoresPage />} />
            <Route path="/scores/:slug" element={<ScoreReaderPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </Suspense>
    </AppErrorBoundary>
  )
}
