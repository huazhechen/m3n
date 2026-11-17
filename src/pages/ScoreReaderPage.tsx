import { Link, useParams } from 'react-router-dom'
import { useMemo, useRef, useState } from 'react'
import { analyzeM3N, formatScoreDiagnostic } from '@m3n/notation'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { ScoreExportDialog } from '../components/ScoreExportDialog'
import type { ScoreExportDialogRef } from '../components/ScoreExportDialog'
import { NavActionContent, TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'
import { useScoreSource } from '../hooks/useScoreSource'
import type { ScoreDisplaySettings } from '../lib/render-score'
import { ScoreLoadStatus } from '../components/ScoreLoadStatus'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const score = presetScores.find((item) => item.slug === slug)
  const { source: scoreSource, status, error, retry } = useScoreSource(slug)
  const exportDialogRef = useRef<ScoreExportDialogRef>(null)
  const [displaySettings, setDisplaySettings] = useState<ScoreDisplaySettings | null>(null)
  const [exportError, setExportError] = useState('')
  const analysis = useMemo(() => analyzeM3N(scoreSource ?? ''), [scoreSource])
  const { invalidMeasureIds: invalidMeasures } = analysis
  const result = { ...analysis.score, ...analysis.interaction, diagnostics: analysis.diagnostics }

  if (status !== 'ready') return <main><TopNav /><ScoreLoadStatus status={status} error={error} onRetry={retry} /></main>

  const scoreIndex = score ? presetScores.indexOf(score) : -1
  const previousScore = scoreIndex > 0 ? presetScores[scoreIndex - 1] : undefined
  const nextScore = scoreIndex >= 0 ? presetScores[scoreIndex + 1] : undefined

  return (
    <main>
      <TopNav actions={<div className="score-reader-actions">
        <div className="score-reader-navigation" role="group" aria-label="切换曲目">
          {score && previousScore ? (
            <Link className="action-button" aria-label="上一曲" title="上一曲" to={`/scores/${previousScore.slug}`}>
              <NavActionContent action="previous" />
            </Link>
          ) : (
            <span className="action-button is-disabled" role="link" aria-label="上一曲" title="上一曲" aria-disabled="true"><NavActionContent action="previous" /></span>
          )}
          {score && nextScore ? (
            <Link className="action-button" aria-label="下一曲" title="下一曲" to={`/scores/${nextScore.slug}`}>
              <NavActionContent action="next" />
            </Link>
          ) : (
            <span className="action-button is-disabled" role="link" aria-label="下一曲" title="下一曲" aria-disabled="true"><NavActionContent action="next" /></span>
          )}
        </div>
        <div className="score-reader-tools" role="group" aria-label="乐谱操作">
          <button
            type="button"
            className="action-button"
            aria-label="打印"
            title="打印"
            onClick={() => exportDialogRef.current?.open()}
          >
            <NavActionContent action="print" />
          </button>
          <Link className="action-button" aria-label="编辑" title="编辑" to={`/editor/${slug}`}>
            <NavActionContent action="edit" />
          </Link>
        </div>
      </div>} />
      <section className="score-reader" aria-label={`${result.title || score?.title || 'Shared'} 乐谱`}>
        <ScoreRenderer
          fitPagedToViewport
          scoreId={slug}
          scoreDocument={analysis.score}

          sourceMap={result.sourceMap}
          invalidMeasureIds={invalidMeasures}
          onDisplaySettingsChange={setDisplaySettings}
        />
        <ScoreExportDialog
          ref={exportDialogRef}
          scoreDocument={analysis.score}
          title={result.title}
          settings={displaySettings ?? { width: result.preferredWidth ?? 720, paged: false }}
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
