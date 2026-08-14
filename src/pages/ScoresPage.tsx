import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { scoreMetadataFromSource, type ScoreDiagnosticSeverity } from '@m3n/notation'
import { TopNav } from '../components/TopNav'
import { deleteLocalScore, listLocalScores, type LocalScore } from '../lib/local-scores'
import { presetScores, type PresetScore } from '../lib/samples'

type ScoreCardData = {
  key: string
  isLocal: boolean
  title: string
  severity: ScoreDiagnosticSeverity
  keySignature: string
  timeSignature: string
  tempo: number
  melodyComplexity: number
  hasLyrics: boolean
  hasBass: boolean
  singer?: string
  composer?: string
  searchText: string
  to: string
  onDelete?: () => void
}

function ScoreCard({
  isLocal,
  title,
  severity,
  keySignature,
  timeSignature,
  tempo,
  melodyComplexity,
  hasLyrics,
  hasBass,
  singer,
  composer,
  to,
  onDelete,
}: ScoreCardData) {
  const navigate = useNavigate()
  const hasDiagnostics = severity !== 'none'
  const diagnosticLabel = severity === 'lyric' ? '仅包含歌词对位问题' : '包含乐谱语法或结构错误'
  const className = `score-card${isLocal ? ' is-local-card' : ''}${hasDiagnostics ? ` is-${severity}-score` : ''}`
  const content = (
    <>
      <div>
        {isLocal && <span className="score-card-marker">本地</span>}
        <h3>{title}</h3>
        <div className="score-notation-tags" aria-label={`旋律复杂度评分 ${melodyComplexity.toFixed(1)}，调号 ${keySignature}，拍号 ${timeSignature}，速度 ${tempo} BPM`}>
          <span className="score-tag">评分 {melodyComplexity.toFixed(1)}</span>
          <span className="score-tag">调 {keySignature}</span>
          <span className="score-tag">拍 {timeSignature}</span>
          <span className="score-tag">速 {tempo} BPM</span>
        </div>
      </div>
      <div className="score-card-footer">
        <div className="score-tags">
          {hasLyrics && <span className="score-tag">词</span>}
          {hasBass && <span className="score-tag">低</span>}
        </div>
        <div className="score-card-footer-right">
          {(singer || composer) && <span className="score-composer">{singer || composer}</span>}
          {onDelete && (
            <button
              type="button"
              className="score-card-action is-danger"
              onClick={(event) => {
                event.stopPropagation()
                onDelete()
              }}
            >
              删除
            </button>
          )}
        </div>
      </div>
    </>
  )
  return isLocal
    ? (
      <div
        className={className}
        role="link"
        tabIndex={0}
        onClick={() => navigate(to)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            navigate(to)
          }
        }}
        aria-label={hasDiagnostics ? `${title}，${diagnosticLabel}` : `${title}，查看乐谱`}
      >
        {content}
      </div>
    )
    : (
      <Link
        className={className}
        to={to}
        aria-label={hasDiagnostics ? `${title}，${diagnosticLabel}` : undefined}
      >
        {content}
      </Link>
    )
}

function presetCardData(score: PresetScore): ScoreCardData {
  return {
    key: `preset:${score.slug}`,
    isLocal: false,
    title: score.title,
    severity: score.diagnosticSeverity,
    keySignature: score.keySignature,
    timeSignature: score.timeSignature,
    tempo: score.tempo,
    melodyComplexity: score.melodyComplexity,
    hasLyrics: score.hasLyrics,
    hasBass: score.hasBass,
    singer: score.singer,
    composer: score.composer,
    searchText: score.searchText,
    to: `/scores/${score.slug}`,
  }
}

function localCardData(score: LocalScore, onDelete: () => void): ScoreCardData {
  const metadata = scoreMetadataFromSource(score.id, score.source)
  return {
    key: `local:${score.id}`,
    isLocal: true,
    title: metadata.title,
    severity: metadata.diagnosticSeverity,
    keySignature: metadata.keySignature,
    timeSignature: metadata.timeSignature,
    tempo: metadata.tempo,
    melodyComplexity: metadata.melodyComplexity,
    hasLyrics: metadata.hasLyrics,
    hasBass: metadata.hasBass,
    singer: metadata.singer,
    composer: metadata.composer,
    searchText: metadata.searchText,
    to: `/scores/${score.id}`,
    onDelete,
  }
}

export function ScoresPage() {
  const [query, setQuery] = useState('')
  const [localScores, setLocalScores] = useState<LocalScore[]>(() => listLocalScores())
  const normalizedQuery = query.toLocaleLowerCase('zh-Hans-CN').replace(/\s+/g, ' ').trim()
  const cards = useMemo(() => {
    const locals = localScores.map((score) => localCardData(score, () => {
      if (window.confirm('确定删除这首本地乐谱吗？')) {
        deleteLocalScore(score.id)
        setLocalScores(listLocalScores())
      }
    }))
    return [...locals, ...presetScores.map(presetCardData)]
  }, [localScores])
  const scores = useMemo(
    () => cards.filter((card) => card.searchText.includes(normalizedQuery)),
    [cards, normalizedQuery],
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
        {scores.length === 0 && (
          <p className="search-empty">没有找到匹配的乐谱。</p>
        )}
        <div className="score-list">
          {scores.map((card) => {
            const { key, ...cardProps } = card
            return <ScoreCard key={key} {...cardProps} />
          })}
        </div>
      </div>
    </main>
  )
}
