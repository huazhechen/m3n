import { Link, Navigate, useParams } from 'react-router-dom'
import { useRef } from 'react'
import { ScoreRenderer } from '../components/ScoreRenderer'
import type { ScoreRendererRef } from '../components/ScoreRenderer'
import { TopNav } from '../components/TopNav'
import { m3nToMei } from '../lib/m3n-mei'
import { presetScores } from '../lib/samples'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const score = presetScores.find((item) => item.slug === slug)
  const scoreRendererRef = useRef<ScoreRendererRef>(null)

  if (!score) {
    return <Navigate to="/scores" replace />
  }

  const result = m3nToMei(score.source)
  const scoreIndex = presetScores.indexOf(score)
  const previousScore = presetScores[scoreIndex - 1]
  const nextScore = presetScores[scoreIndex + 1]

  return (
    <main>
      <TopNav />
      <div className="score-reader-actions">
        {previousScore ? (
          <Link className="secondary-link" to={`/scores/${previousScore.slug}`}>
            上一曲
          </Link>
        ) : (
          <span className="secondary-link is-disabled" aria-disabled="true">上一曲</span>
        )}
        {nextScore ? (
          <Link className="secondary-link" to={`/scores/${nextScore.slug}`}>
            下一曲
          </Link>
        ) : (
          <span className="secondary-link is-disabled" aria-disabled="true">下一曲</span>
        )}
        <button
          type="button"
          className="action-button"
          onClick={() => scoreRendererRef.current?.openExport()}
        >
          打印
        </button>
        <Link className="action-button" to={`/editor?score=${score.slug}`}>
          编辑
        </Link>
      </div>
      <section className="score-reader" aria-label={`${score.title} 乐谱`}>
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
          showPrintButton={false}
        />
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics score-reader-diagnostics" aria-label="乐谱校验错误">
            {result.diagnostics.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </section>
    </main>
  )
}
