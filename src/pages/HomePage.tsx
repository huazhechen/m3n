import { lazy, Suspense, useMemo } from 'react'
import { analyzeM3N } from '@m3n/notation'
import { ScoreRenderer } from '../components/ScoreRenderer'
import { Link, useLocation } from 'react-router-dom'
import { TopNav } from '../components/TopNav'
import homeExample from '../scores/huan_le_song_01.m3n?raw'

const HomeDocumentation = lazy(() => import('../components/HomeDocumentation').then(({ HomeDocumentation }) => ({ default: HomeDocumentation })))

export function HomePage() {
  const analysis = useMemo(() => analyzeM3N(homeExample), [])
  const location = useLocation()
  const documentId = new URLSearchParams(location.search).get('doc')
  const isReading = documentId === 'guide' || documentId === 'manual'

  return (
    <main>
      <TopNav />
      {!isReading && <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Max&apos;s Markup Music Notation</span>
          <h1>M3N 是面向旋律制谱的文本记谱语言。</h1>
          <p>
            使用首调记谱输入旋律，即时呈现为清晰的简谱，让创作、校对与分享都更直接。
          </p>
          <div className="hero-actions">
            <Link to="/scores" className="primary-link">
              浏览乐谱库
            </Link>
            <Link to="/editor" className="secondary-link">
              打开编辑器
            </Link>
            <Link to="/?doc=guide" className="secondary-link" aria-current={documentId === 'guide' ? 'page' : undefined}>
              浏览指南
            </Link>
            <Link to="/?doc=manual" className="secondary-link" aria-current={documentId === 'manual' ? 'page' : undefined}>
              查阅手册
            </Link>
          </div>
        </div>
      </section>}
      {isReading ? <Suspense fallback={<p role="status">正在加载...</p>}><HomeDocumentation /></Suspense> : <>
      <section className="home-sample markdown-panel" aria-label="可试听谱例">
        <ScoreRenderer compact playbackOnly scoreDocument={analysis.score} sourceMap={analysis.interaction.sourceMap} />
      </section>
        <div className="hero-summary" aria-label="M3N 特性">
          <section>
            <h2>首调记谱</h2>
            <p>以首调方式输入旋律，表达清晰，输入自然。</p>
          </section>
          <section>
            <h2>即时渲染</h2>
            <p>输入内容即时呈现为简谱，便于校对、试听和打印。</p>
          </section>
          <section>
            <h2>随时创作</h2>
            <p>直接在浏览器中完成记谱、播放与导出，无需安装额外软件。</p>
          </section>
        </div>
      </>}
    </main>
  )
}
