import { Link, Navigate, useParams } from 'react-router-dom'
import { useRef } from 'react'
import { ScoreRenderer } from '../components/ScoreRenderer'
import type { ScoreRendererRef } from '../components/ScoreRenderer'
import { TopNav } from '../components/TopNav'
import { m3nToAbc } from '../lib/m3n-abc'
import { presetScores } from '../lib/samples'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const score = presetScores.find((item) => item.slug === slug)
  const scoreRendererRef = useRef<ScoreRendererRef>(null)

  if (!score) {
    return <Navigate to="/scores" replace />
  }

  const result = m3nToAbc(score.source)

  return (
    <main>
      <TopNav />
      <div className="score-reader-actions">
        <a
          className="action-button"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            scoreRendererRef.current?.openExport()
          }}
        >
          打印
        </a>
        <Link className="action-button" to={`/editor?score=${score.slug}`}>
          编辑
        </Link>
      </div>
      <section className="score-reader" aria-label={`${score.title} 乐谱`}>
        <ScoreRenderer ref={scoreRendererRef} abc={result.output} />
      </section>
    </main>
  )
}
