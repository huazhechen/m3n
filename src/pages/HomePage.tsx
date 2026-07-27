import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <span className="brand">M3N</span>
        <div className="topbar-actions">
          <Link to="/docs" className="ghost-button">
            文档
          </Link>
          <Link to="/workspace" className="primary-button">
            开始使用
          </Link>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Max's Markup Music Notation</p>
          <h1>把纯文本乐谱，直接变成可读、可编、可渲染的 M3N 工作台。</h1>
          <p className="lede">
            M3N 是面向单谱表、首调思维、文本编辑场景的音乐记谱语言。这个站点提供三种视图：
            编辑器模式、五线谱渲染模式和对照模式。
          </p>
          <div className="cta-row">
            <Link to="/workspace" className="primary-button">
              打开空白渲染界面
            </Link>
            <Link to="/docs" className="ghost-button">
              阅读 README 文档
            </Link>
          </div>
        </div>

        <aside className="hero-card">
          <div className="card-title">核心特性</div>
          <ul>
            <li>React + TypeScript + Vite 搭建的前端工作台</li>
            <li>共享 M3N 解析器，供编辑器、文档页、渲染器复用</li>
            <li>对照模式直接把源码与结构渲染放在同一屏幕</li>
          </ul>
        </aside>
      </section>
    </main>
  )
}
