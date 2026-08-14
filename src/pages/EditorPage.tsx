import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { NotationEditor } from '../components/NotationEditor'
import { TopNav } from '../components/TopNav'
import { isLocalScoreId, loadLocalScore, saveLocalScore } from '../lib/local-scores'
import { presetScores } from '../lib/samples'
import { loadSharedScore, submitScore } from '../lib/shared-scores'
import { isSimulatedSubmit } from '../lib/submit-mode'

export function EditorPage() {
  const navigate = useNavigate()
  const { scoreId } = useParams()
  const localSource = useMemo(() => {
    if (!scoreId) return undefined
    const preset = presetScores.find((item) => item.slug === scoreId)
    if (preset) return preset.source
    if (isLocalScoreId(scoreId)) return loadLocalScore(scoreId)?.source ?? null
    return undefined
  }, [scoreId])
  const [remoteSource, setRemoteSource] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (localSource !== undefined || !scoreId) {
      setRemoteSource(undefined)
      return
    }
    let cancelled = false
    setRemoteSource(undefined)
    void loadSharedScore(scoreId)
      .then((shared) => { if (!cancelled) setRemoteSource(shared?.source ?? null) })
      .catch(() => { if (!cancelled) setRemoteSource(null) })
    return () => { cancelled = true }
  }, [localSource, scoreId])

  const source = localSource ?? remoteSource
  if (scoreId !== undefined && localSource === undefined && remoteSource === undefined) {
    return <main><TopNav /><div className="page-status" role="status">Loading...</div></main>
  }

  return (
    <main>
      <TopNav />
      <NotationEditor
        key={source ?? 'blank-editor'}
        initialSource={source ?? undefined}
        simulatedSubmit={isSimulatedSubmit()}
        onBrowse={async (source) => {
          const local = saveLocalScore(source)
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
