import { Navigate, Route, Routes } from 'react-router-dom'
import { DocsPage } from './pages/DocsPage'
import { HomePage } from './pages/HomePage'
import { WorkspacePage } from './pages/WorkspacePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
