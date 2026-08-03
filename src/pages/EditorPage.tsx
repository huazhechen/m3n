import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { useLocation, useNavigate } from 'react-router-dom'
import { createSharedScore, submitScore } from '../lib/shared-scores'

export function EditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const source = typeof location.state === 'object' && location.state !== null && typeof location.state.source === 'string'
    ? location.state.source
    : undefined
  return (
    <main>
      <TopNav />
      <NotationEditor key={source ?? 'blank-editor'} initialSource={source} onBrowse={async (source) => {
        const id = await createSharedScore(source)
        navigate(`/scores/${id}`)
      }} onSubmit={async (source) => {
        const id = await submitScore(source)
        navigate(`/scores/${id}`)
      }} />
    </main>
  )
}
