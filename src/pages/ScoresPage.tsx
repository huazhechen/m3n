import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { TopNav } from '../components/TopNav'
import { presetScores } from '../lib/samples'
import type { PresetScore } from '../lib/samples'
import { validateM3N } from '../lib/m3n-validate'
import { scoreDiagnosticSeverity, type ScoreDiagnosticSeverity } from '../lib/score-diagnostics'

function ScoreCard({ score, severity }: { score: PresetScore; severity: ScoreDiagnosticSeverity }) {
  const hasDiagnostics = severity !== 'none'
  const diagnosticLabel = severity === 'lyric' ? '仅包含歌词对位问题' : '包含乐谱语法或结构错误'
  return (
    <Link
      className={`score-card${hasDiagnostics ? ` is-${severity}-score` : ''}`}
      to={`/scores/${score.slug}`}
      aria-label={hasDiagnostics ? `${score.title}，${diagnosticLabel}` : undefined}
    >
      <div>
        <h3>{score.title}</h3>
        <div className="score-notation-tags" aria-label={`旋律复杂度评分 ${score.melodyComplexity.toFixed(1)}，调号 ${score.keySignature}，拍号 ${score.timeSignature}，速度 ${score.tempo} BPM`}>
          <span className="score-tag">评分 {score.melodyComplexity.toFixed(1)}</span>
          <span className="score-tag">调 {score.keySignature}</span>
          <span className="score-tag">拍 {score.timeSignature}</span>
          <span className="score-tag">速 {score.tempo} BPM</span>
        </div>
      </div>
      <div className="score-card-footer">
        <div className="score-tags">
          {score.hasLyrics && <span className="score-tag">词</span>}
          {score.hasBass && <span className="score-tag">低</span>}
        </div>
        {(score.singer || score.composer) && <span className="score-composer">{score.singer || score.composer}</span>}
      </div>
    </Link>
  )
}

export function ScoresPage() {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.toLocaleLowerCase('zh-Hans-CN').replace(/\s+/g, ' ').trim()
  const scoreSeverities = useMemo(
    () => new Map(presetScores.map((score) => [score.slug, scoreDiagnosticSeverity(validateM3N(score.source))])),
    [],
  )
  const scores = useMemo(
    () => presetScores.filter((score) => score.searchText.includes(normalizedQuery)),
    [normalizedQuery],
  )
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
              placeholder="搜索标题、作曲者或其他乐谱信息"
            />
          </label>
        </section>
        {scores.length === 0 && (
          <p className="search-empty">没有找到匹配的乐谱。</p>
        )}
        <div className="score-list">
          {scores.map((score) => (
            <ScoreCard key={score.slug} score={score} severity={scoreSeverities.get(score.slug) ?? 'none'} />
          ))}
        </div>
      </div>
    </main>
  )
}
