import { Navigate, Route, Routes } from 'react-router-dom'
import { DocsPage } from './pages/DocsPage'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'
import { ScoreReaderPage } from './pages/ScoreReaderPage'
import { ScoresPage } from './pages/ScoresPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/scores" element={<ScoresPage />} />
      <Route path="/scores/:slug" element={<ScoreReaderPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
