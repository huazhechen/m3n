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
      <section className="page-heading score-reader-heading">
        <div>
          <span className="eyebrow">预置乐谱</span>
          <h1>{score.title}</h1>
          <p>{`${score.composer}${score.subtitle ? ` - ${score.subtitle}` : ''}`}</p>
        </div>
        <Link className="secondary-link" to={`/editor?score=${score.slug}`}>
          编辑
        </Link>
      </section>
      <section className="score-reader" aria-label={`${score.title} 乐谱`}>
        <ScoreRenderer abc={result.output} />
      </section>
    </main>
  )
}
