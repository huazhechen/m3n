import { ResourceLoadingHost } from './components/ResourceLoadingDialog'
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { pruneExpiredSimulatedSubmissions } from './lib/simulated-submissions'

const HomePage = lazy(() => import('./pages/HomePage').then(({ HomePage: Page }) => ({ default: Page })))
const EditorPage = lazy(() => import('./pages/EditorPage').then(({ EditorPage: Page }) => ({ default: Page })))
const ScoresPage = lazy(() => import('./pages/ScoresPage').then(({ ScoresPage: Page }) => ({ default: Page })))
const ScoreReaderPage = lazy(() => import('./pages/ScoreReaderPage').then(({ ScoreReaderPage: Page }) => ({ default: Page })))
const ConverterPage = lazy(() => import('./pages/ConverterPage').then(({ ConverterPage: Page }) => ({ default: Page })))
const WorksPage = lazy(() => import('./pages/WorksPage').then(({ WorksPage: Page }) => ({ default: Page })))
const WorksLayout = lazy(() => import('./pages/WorksLayout').then(({ WorksLayout: Page }) => ({ default: Page })))
const ToolsPage = lazy(() => import('./pages/ToolsPage').then(({ ToolsPage: Page }) => ({ default: Page })))
const HarmonicaScalesPage = lazy(() => import('./pages/HarmonicaScalesPage').then(({ HarmonicaScalesPage: Page }) => ({ default: Page })))
const MetronomePage = lazy(() => import('./pages/MetronomePage').then(({ MetronomePage: Page }) => ({ default: Page })))

function isH123Host() {
  return typeof window !== 'undefined' && window.location.hostname.split('.')[0]?.toLowerCase() === 'h123'
}

export default function App() {
  useEffect(() => {
    pruneExpiredSimulatedSubmissions()
  }, [])
  return (
    <AppErrorBoundary>
      <ResourceLoadingHost />
      <Suspense fallback={<div className="page-status" role="status">正在加载...</div>}>
        {isH123Host() ? (
          <Routes><Route path="*" element={<ConverterPage />} /></Routes>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/editor/:scoreId?" element={<EditorPage />} />
            <Route path="/scores" element={<ScoresPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/tools/scales" element={<HarmonicaScalesPage />} />
            <Route path="/tools/metronome" element={<MetronomePage />} />
            <Route path="/scores/:slug" element={<ScoreReaderPage />} />
            <Route path="/works" element={<WorksLayout />}>
              <Route index element={<WorksPage />} />
              <Route path=":slug" element={<ScoreReaderPage collection="works" />} />
              <Route path=":scoreId/edit" element={<EditorPage collection="works" />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </Suspense>
    </AppErrorBoundary>
  )
}
