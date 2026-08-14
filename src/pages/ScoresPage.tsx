import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { scoreMetadataFromSource, type ScoreDiagnosticSeverity } from '@m3n/notation'
import { TopNav } from '../components/TopNav'
import { deleteLocalScore, listLocalScores, type LocalScore } from '../lib/local-scores'
import { presetScores } from '../lib/samples'
import type { PresetScore } from '../lib/samples'

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
  const [localScores, setLocalScores] = useState<LocalScore[]>(() => listLocalScores())
  const normalizedQuery = query.toLocaleLowerCase('zh-Hans-CN').replace(/\s+/g, ' ').trim()
  const scores = useMemo(
    () => presetScores.filter((score) => score.searchText.includes(normalizedQuery)),
    [normalizedQuery],
  )
  useEffect(() => {
    setLocalScores(listLocalScores())
  }, [])
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
        <section className="local-score-library" aria-label="本地乐谱">
          <span className="eyebrow">Local Scores</span>
          <h2>本地乐谱</h2>
          <div className={`local-score-card${localScores.length === 0 ? ' is-empty' : ''}`}>
            {localScores.length === 0 ? (
              <p className="local-score-empty">暂无本地乐谱。在编辑器中点击“浏览”即可把当前乐谱保存到本地。</p>
            ) : (
              <ul className="local-score-list">
                {localScores.map((score) => {
                  const metadata = scoreMetadataFromSource(score.id, score.source)
                  return (
                    <li key={score.id} className="local-score-item">
                      <div className="local-score-info">
                        <strong>{metadata.title}</strong>
                        <div className="score-notation-tags" aria-label={`调号 ${metadata.keySignature}，拍号 ${metadata.timeSignature}，速度 ${metadata.tempo} BPM`}>
                          <span className="score-tag">调 {metadata.keySignature}</span>
                          <span className="score-tag">拍 {metadata.timeSignature}</span>
                          <span className="score-tag">速 {metadata.tempo} BPM</span>
                        </div>
                      </div>
                      <div className="local-score-actions">
                        <Link className="action-button" to={`/scores/${score.id}`}>查看</Link>
                        <button
                          type="button"
                          className="action-button"
                          onClick={() => {
                            if (window.confirm('确定删除这首本地乐谱吗？')) {
                              deleteLocalScore(score.id)
                              setLocalScores(listLocalScores())
                            }
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
        {scores.length === 0 && (
          <p className="search-empty">没有找到匹配的乐谱。</p>
        )}
        <div className="score-list">
          {scores.map((score) => (
            <ScoreCard key={score.slug} score={score} severity={score.diagnosticSeverity} />
          ))}
        </div>
      </div>
    </main>
  )
}
