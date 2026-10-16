import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { isLocalScoreId, saveLocalScore } from '../lib/local-scores'
import { submitScore } from '../lib/shared-scores'
import { isSimulatedSubmit } from '../lib/submit-mode'
import { useScoreSource } from '../hooks/useScoreSource'
import { ScoreLoadStatus } from '../components/ScoreLoadStatus'

export function EditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const exampleSource: string | undefined = typeof location.state?.exampleSource === 'string' ? location.state.exampleSource : undefined
  const { scoreId } = useParams()
  const { source, status, error, retry } = useScoreSource(scoreId)
  if (status !== 'ready') return <main><TopNav /><ScoreLoadStatus status={status} error={error} onRetry={retry} /></main>

  return (
    <main>
      <TopNav />
      <NotationEditor
        key={scoreId ?? 'blank-editor'}
        initialSource={exampleSource ?? source ?? undefined}
        draftScope={exampleSource ? `example-${location.key}` : undefined}
        scoreId={scoreId}
        simulatedSubmit={isSimulatedSubmit()}
        onBrowse={async (source) => {
          const local = saveLocalScore(source, Date.now(), isLocalScoreId(scoreId) ? scoreId : undefined)
          navigate(`/scores/${local.id}`)
        }}
        onSubmit={async (source) => {
        const id = await submitScore(source)
        navigate(`/scores/${id}`)
        }}
      />
    </main>
  )
}
