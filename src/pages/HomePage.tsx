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
          <p className="eyebrow">Max&apos;s Markup Music Notation</p>
          <h1>把纯文本乐谱直接变成可编辑、可渲染、可播放的 M3N 工作台。</h1>
          <p className="lede">
            M3N 面向单谱表、首调记谱和文本编辑场景。这里提供编辑器、五线谱渲染和文档阅读三条主路径。
          </p>
          <div className="cta-row">
            <Link to="/workspace" className="primary-button">
              打开工作台
            </Link>
            <Link to="/docs" className="ghost-button">
              阅读 README
            </Link>
          </div>
        </div>

        <aside className="hero-card">
          <div className="card-title">核心能力</div>
          <ul>
            <li>文本输入后直接渲染五线谱</li>
            <li>支持播放与当前音符高亮</li>
            <li>文档页面按章节分页并内联渲染示例</li>
          </ul>
        </aside>
      </section>
    </main>
  )
}
