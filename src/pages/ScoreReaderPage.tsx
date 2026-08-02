import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useMemo, useRef } from 'react'
import { ScoreRenderer } from '../components/ScoreRenderer'
import type { ScoreRendererRef } from '../components/ScoreRenderer'
import { TopNav } from '../components/TopNav'
import { m3nToMei } from '../lib/m3n-mei'
import { invalidMeasureIds } from '../lib/m3n-validate'
import { presetScores } from '../lib/samples'
import { sharedScoreSource, sharedScoreUrl } from '../lib/score-share'
import { formatScoreDiagnostic } from '../lib/notation/diagnostics'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const location = useLocation()
  const score = presetScores.find((item) => item.slug === slug)
  const source = sharedScoreSource(location.search)
  const scoreRendererRef = useRef<ScoreRendererRef>(null)
  const scoreSource = source ?? score?.source
  const result = useMemo(() => m3nToMei(scoreSource ?? ''), [scoreSource])
  const invalidMeasures = useMemo(() => invalidMeasureIds(scoreSource ?? ''), [scoreSource])

  if (!scoreSource) {
    return <Navigate to="/scores" replace />
  }

  const scoreIndex = score ? presetScores.indexOf(score) : -1
  const previousScore = scoreIndex > 0 ? presetScores[scoreIndex - 1] : undefined
  const nextScore = scoreIndex >= 0 ? presetScores[scoreIndex + 1] : undefined

  return (
    <main>
      <TopNav />
      <div className="score-reader-actions">
        {score && previousScore ? (
          <Link className="action-button" to={`/scores/${previousScore.slug}`}>
            上一曲
          </Link>
        ) : (
          <span className="action-button is-disabled" aria-disabled="true">上一曲</span>
        )}
        {score && nextScore ? (
          <Link className="action-button" to={`/scores/${nextScore.slug}`}>
            下一曲
          </Link>
        ) : (
          <span className="action-button is-disabled" aria-disabled="true">下一曲</span>
        )}
        <button
          type="button"
          className="action-button"
          onClick={() => scoreRendererRef.current?.openExport()}
        >
          打印
        </button>
        <Link className="action-button" to={sharedScoreUrl('/editor', scoreSource)}>
          编辑
        </Link>
      </div>
      <section className="score-reader" aria-label={`${result.title || score?.title || '共享'} 乐谱`}>
        <ScoreRenderer
          ref={scoreRendererRef}
          mei={result.mei}
          title={result.title}
          hasBassStaff={result.hasBassStaff}
          headerMetadata={result.headerMetadata}
          sourceMap={result.sourceMap}
          accompaniment={result.accompaniment}
          tempoChanges={result.tempoChanges}
          tempo={result.tempo}
          invalidMeasureIds={invalidMeasures}
          showPrintButton={false}
        />
        {result.diagnosticDetails.length > 0 && (
          <ul className="diagnostics score-reader-diagnostics" aria-label="乐谱校验错误">
            {result.diagnosticDetails.map((item) => <li key={`${item.code}:${item.legacyMessage}`}>{formatScoreDiagnostic(item)}</li>)}
          </ul>
        )}
      </section>
    </main>
  )
}
