import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { useSearchParams } from 'react-router-dom'
import { sharedScoreSource } from '../lib/score-share'

export function EditorPage() {
  const [searchParams] = useSearchParams()
  const source = sharedScoreSource(searchParams.toString())

  return (
    <main>
      <TopNav />
      <NotationEditor key={source ?? 'blank-editor'} initialSource={source ?? undefined} />
    </main>
  )
}
