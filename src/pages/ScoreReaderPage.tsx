import { Link, Navigate, useParams } from 'react-router-dom'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { TopNav } from '../components/TopNav'
import { m3nToAbc } from '../lib/m3n-abc'
import { presetScores } from '../lib/samples'

export function ScoreReaderPage() {
  const { slug } = useParams()
  const score = presetScores.find((item) => item.slug === slug)

  if (!score) {
    return <Navigate to="/scores" replace />
  }

  const result = m3nToAbc(score.source)

  return (
    <main>
      <TopNav />
      <div className="score-reader-actions">
        <Link className="secondary-link" to={`/editor?score=${score.slug}`}>
          编辑
        </Link>
      </div>
      <section className="score-reader" aria-label={`${score.title} 乐谱`}>
        <ScoreRenderer abc={result.output} />
      </section>
    </main>
  )
}
