import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NavActionIcon, TopNav } from '../components/TopNav'
import { getWorks, type Work } from '../lib/works'
import { matchesScoreSearch } from '../lib/score-search'
import { sortScoresByModifiedTime, sortScoresByTitle } from '../lib/score-order'

export function WorksPage() {
  const [works, setWorks] = useState<Work[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [modified, setModified] = useState(false)
  useEffect(() => {
    let cancelled = false
    setError('')
    void getWorks().then(value => { if (!cancelled) setWorks(value) }).catch(() => {
      if (!cancelled) setError('独立作品加载失败，请重试。')
    })
    return () => { cancelled = true }
  }, [attempt])
  const matching = useMemo(() => {
    const filtered = (works ?? []).filter(work => matchesScoreSearch({ ...work, isLocal: false }, query))
    return modified ? sortScoresByModifiedTime(filtered) : sortScoresByTitle(filtered)
  }, [works, query, modified])
  return <main>
    <TopNav showTools libraryTo="/works" libraryLabel="独立作品" />
    <div className="score-library">
      <section className="library-toolbar">
        <h1>独立作品</h1>
        <div className="library-search-actions">
          <label className="score-search"><input type="search" aria-label="搜索独立作品" placeholder="搜索曲名、调号、拍号…" value={query} onChange={event => setQuery(event.currentTarget.value)} /></label>
          <button type="button" className="library-view-toggle" aria-label="切换作品排序方式" title={modified ? '切换为字母顺序' : '切换为最后修改时间'} onClick={() => setModified(value => !value)}><NavActionIcon action="sort" /></button>
        </div>
      </section>
      <div className="library-groups">
        {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></p> : works === null ? <p role="status">正在加载...</p> : <>
          <p className="library-sort-label" role="status">{modified ? '编辑时间' : '首字母'}</p>
          {matching.length === 0 && <p className="search-empty">{works.length === 0 ? '暂无独立作品。' : '没有找到匹配的作品。'}</p>}
          <div className="score-list">{matching.map(work => <Link key={work.slug} className="score-card" to={`/works/${work.slug}`}>
            <div><h3>{work.title}</h3><div className="score-notation-tags">
              <span className="score-tag">调 {work.keySignature}</span><span className="score-tag">拍 {work.timeSignature}</span><span className="score-tag">速 {work.tempo} BPM</span>
              {work.hasLyrics && <span className="score-tag">词</span>}{work.hasBass && <span className="score-tag">低</span>}
            </div></div>
            {(work.singer || work.composer || work.origin) && <div className="score-card-footer"><span className="score-composer">{work.singer || work.composer || work.origin}</span></div>}
          </Link>)}</div>
        </>}
      </div>
    </div>
  </main>
}
