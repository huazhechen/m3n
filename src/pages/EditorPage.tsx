import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { useNavigate } from 'react-router-dom'
import { createSharedScore } from '../lib/shared-scores'

export function EditorPage() {
  const navigate = useNavigate()
  return (
    <main>
      <TopNav />
      <NotationEditor onBrowse={async (source) => {
        const id = await createSharedScore(source)
        navigate(`/scores/${id}`)
      }} />
    </main>
  )
}
