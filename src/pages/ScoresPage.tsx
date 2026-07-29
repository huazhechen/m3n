import { Link } from 'react-router-dom'
import { TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'

export function ScoresPage() {
  const categories = Array.from(new Set(presetScores.map((score) => score.category)))

  return (
    <main>
      <TopNav />
      <div className="score-library">
        {categories.map((category) => (
          <section className="score-section" key={category}>
            <div className="section-heading">
              <span className="eyebrow">{category}</span>
              <h2>{category}</h2>
            </div>
            <div className="score-list">
              {presetScores
                .filter((score) => score.category === category)
                .map((score) => (
                  <Link className="score-card" key={score.slug} to={`/scores/${score.slug}`}>
                    <div>
                      <h3>{score.title}</h3>
                      {score.subtitle && <p>{score.subtitle}</p>}
                    </div>
                    <span>{score.composer}</span>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
