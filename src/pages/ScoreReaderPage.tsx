import { Link, useParams } from 'react-router-dom'
import { useMemo, useRef, useState } from 'react'
import { analyzeM3N, formatScoreDiagnostic } from '@m3n/notation'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { ScoreExportDialog } from '../components/ScoreExportDialog'
import type { ScoreExportDialogRef } from '../components/ScoreExportDialog'
import { TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'
import {
  DEFAULT_SCORE_WIDTH,
  readNumberedNotation,
  writeNumberedNotation,
  SCORE_WIDTH_KEY,
  SCORE_WIDTH_MAX,
  SCORE_WIDTH_MIN,
  readRendererSetting,
} from '../lib/renderer-settings'
import { useScoreSource } from '../hooks/useScoreSource'
import { ScoreLoadStatus } from '../components/ScoreLoadStatus'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const score = presetScores.find((item) => item.slug === slug)
  const { source: scoreSource, status, error } = useScoreSource(slug)
  const exportDialogRef = useRef<ScoreExportDialogRef>(null)
  const [exportWidth, setExportWidth] = useState(() => readRendererSetting(
    SCORE_WIDTH_KEY,
    DEFAULT_SCORE_WIDTH,
    SCORE_WIDTH_MIN,
    SCORE_WIDTH_MAX,
  ))
  const [exportError, setExportError] = useState('')
  const [numberedNotation, setNumberedNotation] = useState(readNumberedNotation)
  const analysis = useMemo(() => analyzeM3N(scoreSource ?? ''), [scoreSource])
  const { conversion: result, invalidMeasureIds: invalidMeasures } = analysis

  if (status !== 'ready') return <main><TopNav /><ScoreLoadStatus status={status} error={error} /></main>

  const scoreIndex = score ? presetScores.indexOf(score) : -1
  const previousScore = scoreIndex > 0 ? presetScores[scoreIndex - 1] : undefined
  const nextScore = scoreIndex >= 0 ? presetScores[scoreIndex + 1] : undefined

  return (
    <main>
      <TopNav />
      <div className="score-reader-actions">
        <div className="score-reader-navigation" role="group" aria-label="切换曲目">
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
        </div>
        <div className="score-reader-tools" role="group" aria-label="乐谱操作">
          <button
            type="button"
            className="action-button"
            onClick={() => exportDialogRef.current?.open()}
          >
            打印
          </button>
          <Link className="action-button" to={`/editor/${slug}`}>
            编辑
          </Link>
        </div>
      </div>
      <section className="score-reader" aria-label={`${result.title || score?.title || 'Shared'} 乐谱`}>
        <ScoreRenderer
          mei={result.mei}
          scoreDocument={analysis.score}
          headerMetadata={result.headerMetadata}
          sourceMap={result.sourceMap}
          invalidMeasureIds={invalidMeasures}
          numberedNotation={numberedNotation}
          onNumberedNotationChange={(enabled) => {
            setNumberedNotation(enabled)
            writeNumberedNotation(enabled)
          }}
          onLayoutWidthChange={setExportWidth}
        />
        <ScoreExportDialog
          ref={exportDialogRef}
          mei={result.mei}
          scoreDocument={analysis.score}
          numberedNotation={numberedNotation}
          title={result.title}
          width={exportWidth}
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
