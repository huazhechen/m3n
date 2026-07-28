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
        <h1>README 阅读视图</h1>
        <p>文档按四级标题分页展示，左侧提供目录导航，文中的 M3N 代码块会直接渲染为乐谱结果。</p>
      </section>

      <MarkdownDocument source={readmeSource} />
    </main>
  )
}
