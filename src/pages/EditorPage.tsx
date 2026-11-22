import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { isLocalScoreId, saveLocalScore } from '../lib/local-scores'
import { submitScore } from '../lib/shared-scores'
import { isSimulatedSubmit } from '../lib/submit-mode'
import { useScoreSource } from '../hooks/useScoreSource'
import { ScoreLoadStatus } from '../components/ScoreLoadStatus'

export function EditorPage({ collection = 'scores' }: { collection?: 'scores' | 'works' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const exampleSource: string | undefined = typeof location.state?.exampleSource === 'string' ? location.state.exampleSource : undefined
  const { scoreId } = useParams()
  const { source, status, error, retry } = useScoreSource(scoreId ?? (exampleSource || collection === 'works' ? undefined : 'huan_le_song_01'), collection)
  const navProps = collection === 'works' ? { libraryTo: '/works', libraryLabel: '独立作品' } : {}
  if (status !== 'ready') return <main className="editor-page"><TopNav {...navProps} /><ScoreLoadStatus {...navProps} status={status} error={error} onRetry={retry} /></main>

  return (
    <main className="editor-page">
      <TopNav {...navProps} />
      <NotationEditor
        key={`${collection}:${scoreId ?? 'blank-editor'}`}
        initialSource={exampleSource ?? source ?? ''}
        draftScope={exampleSource ? `example-${location.key}` : collection === 'works' ? `works-${scoreId}` : undefined}
        scoreId={collection === 'works' ? `works:${scoreId}` : scoreId}
        simulatedSubmit={isSimulatedSubmit()}
        onBrowse={async (source) => {
          const local = saveLocalScore(source, Date.now(), collection === 'scores' && isLocalScoreId(scoreId) ? scoreId : undefined)
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
