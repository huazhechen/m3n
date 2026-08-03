import { Link, Navigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScoreRenderer } from '../components/ScoreRenderer'
import type { ScoreRendererRef } from '../components/ScoreRenderer'
import { TopNav } from '../components/TopNav'
import { m3nToMei } from '../lib/m3n-mei'
import { invalidMeasureIds } from '../lib/m3n-validate'
import { loadPresetScoreSource, presetScores } from '../lib/samples'
import { formatScoreDiagnostic } from '../lib/notation/diagnostics'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const score = presetScores.find((item) => item.slug === slug)
  const [loadedSource, setLoadedSource] = useState<string | null>(null)
  const scoreRendererRef = useRef<ScoreRendererRef>(null)
  const scoreSource = loadedSource
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    void loadPresetScoreSource(slug).then((value) => {
      if (!cancelled) setLoadedSource(value)
    })
    return () => { cancelled = true }
  }, [slug])
  const result = useMemo(() => m3nToMei(scoreSource ?? ''), [scoreSource])
  const invalidMeasures = useMemo(() => invalidMeasureIds(scoreSource ?? ''), [scoreSource])

  if (!score) {
    return <Navigate to="/scores" replace />
  }
  if (scoreSource === null) return <main><TopNav /><div className="page-status" role="status">Loading...</div></main>

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
      </div>
      <section className="score-reader" aria-label={`${result.title || score.title} 乐谱`}>
        <ScoreRenderer
          ref={scoreRendererRef}
          mei={result.mei}
          title={result.title}
          hasBassStaff={result.hasBassStaff}
          headerMetadata={result.headerMetadata}
          sourceMap={result.sourceMap}
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
