import { Link } from 'react-router-dom'
import { TopNav } from '../components/TopNav'

export function HomePage() {
  return (
    <main>
      <TopNav />
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Max&apos;s Markup Music Notation</span>
          <h1>M3N 是面向旋律制谱的文本记谱语言。</h1>
          <p>
            使用首调记谱输入旋律，即时呈现为清晰的标准五线谱，让创作、校对与分享都更直接。
          </p>
          <div className="hero-actions">
            <Link to="/editor" className="primary-link">
              打开在线编辑器
            </Link>
            <Link to="/scores" className="secondary-link">
              浏览乐谱库
            </Link>
            <Link to="/docs" className="secondary-link">
              阅读文档
            </Link>
          </div>
        </div>
        <div className="hero-summary" aria-label="M3N 特性">
          <section>
            <h2>首调记谱</h2>
            <p>以首调方式输入旋律，表达清晰，输入自然。</p>
          </section>
          <section>
            <h2>即时渲染</h2>
            <p>输入内容即时呈现为标准五线谱，便于校对、试听和打印。</p>
          </section>
          <section>
            <h2>随时创作</h2>
            <p>直接在浏览器中完成记谱、播放与导出，无需安装额外软件。</p>
          </section>
        </div>
      </section>
    </main>
  )
}
