import { Link } from 'react-router-dom'
import { MarkdownDocument } from '../components/MarkdownDocument'
import readmeSource from '../../README.md?raw'

export function DocsPage() {
  return (
    <main className="page-shell docs-page">
      <header className="topbar">
        <Link to="/" className="brand">
          M3N
        </Link>
        <div className="topbar-actions">
          <Link to="/workspace" className="ghost-button">
            开始使用
          </Link>
        </div>
      </header>

      <section className="page-intro">
        <p className="eyebrow">文档</p>
        <h1>README 渲染视图</h1>
        <p>
          这里直接渲染仓库中的 <code>README.md</code>。所有 <code>m3n</code> 代码块都会用对照模式展示。
        </p>
      </section>

      <MarkdownDocument source={readmeSource} />
    </main>
  )
}
