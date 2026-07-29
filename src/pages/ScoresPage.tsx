import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'

export function ScoresPage() {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.toLocaleLowerCase('zh-Hans-CN').replace(/\s+/g, ' ').trim()
  const scores = useMemo(
    () => presetScores.filter((score) => score.searchText.includes(normalizedQuery)),
    [normalizedQuery],
  )
  const categories = Array.from(new Set(scores.map((score) => score.category)))

  return (
    <main>
      <TopNav />
      <div className="score-library">
        <section className="library-toolbar">
          <div>
            <span className="eyebrow">M3N Score Library</span>
            <h1>乐谱库</h1>
          </div>
          <label className="score-search">
            <input
              type="search"
              aria-label="搜索乐谱"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="搜索标题、作曲者、分类或其他乐谱信息"
            />
          </label>
        </section>
        {scores.length === 0 && (
          <p className="search-empty">没有找到匹配的乐谱。</p>
        )}
        {categories.map((category) => (
          <section className="score-section" key={category}>
            <div className="section-heading">
              <h2>{category}</h2>
            </div>
            <div className="score-list">
              {scores
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
