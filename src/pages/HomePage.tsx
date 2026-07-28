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
            用接近简谱的首调输入写旋律，用 abcjs 渲染为标准五线谱，并保留文本格式便于分享、版本管理和在线编辑。
          </p>
          <div className="hero-actions">
            <Link to="/editor" className="primary-link">
              打开在线编辑器
            </Link>
            <Link to="/docs" className="secondary-link">
              阅读文档
            </Link>
          </div>
        </div>
        <div className="hero-summary" aria-label="M3N 特性">
          <section>
            <h2>文本优先</h2>
            <p>所有乐谱内容都是可复制、可比较、可提交的纯文本。</p>
          </section>
          <section>
            <h2>双向转换</h2>
            <p>M3N 和 ABC Notation 可以在编辑器中互相转换，便于接入 abcjs 生态。</p>
          </section>
          <section>
            <h2>部署简单</h2>
            <p>通过 `npm run build` 生成静态 `dist` 目录，适合部署到 Cloudflare Pages。</p>
          </section>
        </div>
      </section>
    </main>
  )
}

