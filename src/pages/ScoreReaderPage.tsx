import { Link, Navigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { ScoreExportDialog } from '../components/ScoreExportDialog'
import type { ScoreExportDialogRef } from '../components/ScoreExportDialog'
import { TopNav } from '../components/TopNav'
import { analyzeM3N } from '../lib/notation/analysis'
import { presetScores } from '../lib/samples'
import { formatScoreDiagnostic } from '../lib/notation/diagnostics'
import { isSharedScoreId, loadSharedScore } from '../lib/shared-scores'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const score = presetScores.find((item) => item.slug === slug)
  const [sharedSource, setSharedSource] = useState<string | null | undefined>(undefined)
  const exportDialogRef = useRef<ScoreExportDialogRef>(null)
  const [layoutWidth, setLayoutWidth] = useState(800)
  const [exportError, setExportError] = useState('')
  useEffect(() => {
    let cancelled = false
    if (score || !slug || !isSharedScoreId(slug)) {
      setSharedSource(null)
      return () => { cancelled = true }
    }
    setSharedSource(undefined)
    void loadSharedScore(slug)
      .then((shared) => { if (!cancelled) setSharedSource(shared?.source ?? null) })
      .catch(() => { if (!cancelled) setSharedSource(null) })
    return () => { cancelled = true }
  }, [score, slug])

  const scoreSource = score?.source ?? sharedSource ?? ''
  const analysis = useMemo(() => analyzeM3N(scoreSource), [scoreSource])
  const { conversion: result, invalidMeasureIds: invalidMeasures } = analysis

  if (!score && sharedSource === undefined) {
    return <main><TopNav /><div className="page-status" role="status">Loading...</div></main>
  }
  if (!score && sharedSource === null) {
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
          onClick={() => exportDialogRef.current?.open()}
        >
          打印
        </button>
        <label className="score-width-field">
          <span>乐谱宽度</span>
          <input
            type="number"
            min="320"
            max="8000"
            step="10"
            value={layoutWidth}
            aria-label="乐谱宽度"
            onChange={(event) => {
              const value = Number(event.currentTarget.value)
              if (Number.isFinite(value)) setLayoutWidth(Math.max(320, Math.min(8000, value)))
            }}
          />
          <span>px</span>
        </label>
        <Link className="action-button" to="/editor" state={{ source: scoreSource }}>
          编辑
        </Link>
      </div>
      <section className="score-reader" aria-label={`${result.title || score?.title || 'Shared'} 乐谱`}>
        <ScoreRenderer
          mei={result.mei}
          headerMetadata={result.headerMetadata}
          sourceMap={result.sourceMap}
          layoutWidth={layoutWidth}
          invalidMeasureIds={invalidMeasures}
        />
        <ScoreExportDialog
          ref={exportDialogRef}
          mei={result.mei}
          title={result.title}
          width={layoutWidth}
          hasBassStaff={result.hasBassStaff}
          headerMetadata={result.headerMetadata}
          onError={setExportError}
        />
        {exportError && <p className="render-message" role="alert">{exportError}</p>}
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics score-reader-diagnostics" aria-label="乐谱校验错误">
            {result.diagnostics.map((item) => <li key={`${item.code}:${item.message}`}>{formatScoreDiagnostic(item)}</li>)}
          </ul>
        )}
      </section>
    </main>
  )
}
