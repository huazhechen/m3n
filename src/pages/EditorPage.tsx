import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'
import { useSearchParams } from 'react-router-dom'

export function EditorPage() {
  const [searchParams] = useSearchParams()
  const selectedScore = presetScores.find((score) => score.slug === searchParams.get('score'))

  return (
    <main>
      <TopNav />
      <NotationEditor key={selectedScore?.slug ?? 'blank-editor'} initialSource={selectedScore?.source} />
    </main>
  )
}
