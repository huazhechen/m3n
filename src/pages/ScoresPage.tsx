import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { scoreMetadataFromSource, type ScoreDiagnosticSeverity } from '@m3n/notation'
import { TopNav } from '../components/TopNav'
import { deleteLocalScore, listLocalScores, type LocalScore } from '../lib/local-scores'
import { presetScores, type PresetScore } from '../lib/samples'
import { sortScoresByTitle, scoreTitleInitial } from '../lib/score-order'
import { LibraryIndex } from '../components/LibraryIndex'
import { matchesScoreSearch } from '../lib/score-search'

type ScoreCardData = {
  key: string
  category?: PresetScore['category']
  isLocal: boolean
  title: string
  severity: ScoreDiagnosticSeverity
  keySignature: string
  timeSignature: string
  tempo: number
  hasLyrics: boolean
  hasBass: boolean
  singer?: string
  composer?: string
  origin?: string
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
  hasLyrics,
  hasBass,
  singer,
  composer,
  origin,
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
        <h3>{title}</h3>
        <div className="score-notation-tags" aria-label={`调号 ${keySignature}，拍号 ${timeSignature}，速度 ${tempo} BPM`}>
          <span className="score-tag">调 {keySignature}</span>
          <span className="score-tag">拍 {timeSignature}</span>
          <span className="score-tag">速 {tempo} BPM</span>
          {isLocal && <span className="score-tag score-card-marker">本地</span>}
          {hasLyrics && <span className="score-tag">词</span>}
          {hasBass && <span className="score-tag">低</span>}
        </div>
      </div>
      {(singer || composer || origin) && <div className="score-card-footer">
        <span className="score-composer">{singer || composer || origin}</span>
      </div>}
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
        {onDelete && (
          <button
            type="button"
            className="score-card-delete"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          >
            删除
          </button>
        )}
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
    category: score.category,
    isLocal: false,
    title: score.title,
    severity: score.diagnosticSeverity,
    keySignature: score.keySignature,
    timeSignature: score.timeSignature,
    tempo: score.tempo,
    hasLyrics: score.hasLyrics,
    hasBass: score.hasBass,
    singer: score.singer,
    composer: score.composer,
    origin: score.origin,
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
    hasLyrics: metadata.hasLyrics,
    hasBass: metadata.hasBass,
    singer: metadata.singer,
    composer: metadata.composer,
    origin: metadata.origin,
    searchText: metadata.searchText,
    to: `/scores/${score.id}`,
    onDelete,
  }
}

export function ScoresPage() {
  const [query, setQuery] = useState('')
  const [categorized, setCategorized] = useState(() => {
    try { return localStorage.getItem('m3n:library-view') === 'category' } catch { return false }
  })
  const [localScores, setLocalScores] = useState<LocalScore[]>(() => listLocalScores())
  const cards = useMemo(() => {
    const locals = localScores.map((score) => localCardData(score, () => {
      if (window.confirm('确定删除这首本地乐谱吗？')) {
        deleteLocalScore(score.id)
        setLocalScores(listLocalScores())
      }
    }))
    return [...locals, ...sortScoresByTitle(presetScores.map(presetCardData))]
  }, [localScores])
  const scores = useMemo(
    () => cards.filter(card => matchesScoreSearch(card, query)),
    [cards, query],
  )
  const groups = useMemo(() => {
    const grouped = new Map<string, { initial: string; title: string; order: number; items: ScoreCardData[] }>()
    for (const card of scores) {
      const initial = card.isLocal ? '☆' : categorized ? card.category?.id ?? 'other' : scoreTitleInitial(card.title)
      const title = card.isLocal ? '本地作品' : categorized ? card.category?.title ?? '其他曲目' : initial
      const order = card.isLocal ? -1 : card.category?.order ?? Number.MAX_SAFE_INTEGER
      const group = grouped.get(initial) ?? { initial, title, order, items: [] }
      group.items.push(card)
      grouped.set(initial, group)
    }
    const result = [...grouped.values()]
    return categorized ? result.sort((a, b) => a.order - b.order) : result
  }, [scores, categorized])
  const showIndex = !categorized && groups.length >= 3 && scores.length >= 12
  useEffect(() => {
    setLocalScores(listLocalScores())
  }, [])
  return (
    <main>
      <TopNav />
      <div className={`score-library${showIndex ? ' has-letter-index' : ''}`}>
        <section className="library-toolbar">
          <h1>乐谱库</h1>
          <button type="button" className="library-view-toggle secondary-link" aria-label="切换曲库展示方式" aria-pressed={categorized} title={categorized ? '切换为字母顺序' : '切换为分类展示'} onClick={() => {
            const next = !categorized
            setCategorized(next)
            try { localStorage.setItem('m3n:library-view', next ? 'category' : 'alphabetical') } catch { /* Browsing still works without storage. */ }
          }}>{categorized ? '分类展示' : '字母顺序'}</button>
          <label className="score-search">
            <input
              type="search"
              aria-label="搜索乐谱"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="搜索曲名、词、低、本地、调号、拍号…"
            />
          </label>
        </section>
        {scores.length === 0 && (
          <p className="search-empty">没有找到匹配的乐谱。</p>
        )}
        {groups.map(({ initial, title, items }) => (
          <section className="library-group" id={`library-group-${initial}`} data-library-initial={initial} key={initial} aria-labelledby={`library-heading-${initial}`}>
            <h2 className="library-group-heading" id={`library-heading-${initial}`}>
              {title}
            </h2>
            <div className="score-list">
              {items.map(({ key, ...cardProps }) => <ScoreCard key={key} {...cardProps} />)}
            </div>
          </section>
        ))}
        {showIndex && <LibraryIndex initials={groups.map(group => group.initial)} />}

      </div>
    </main>
  )
}
