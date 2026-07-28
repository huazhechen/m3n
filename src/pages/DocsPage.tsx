import { MarkdownBook } from '../components/MarkdownBook'
import { TopNav } from '../components/TopNav'
import guide from '../../GUIDE.md?raw'
import manual from '../../MANUAL.md?raw'
import readme from '../../README.md?raw'

const documents = [
  { id: 'readme', title: '简介', description: 'M3N 的定位和快速示例。', source: readme },
  { id: 'guide', title: '指南', description: '循序渐进学习 M3N。', source: guide },
  { id: 'manual', title: '手册', description: '完整语法与约束速查。', source: manual },
]

export function DocsPage() {
  return (
    <main>
      <TopNav />
      <section className="page-heading">
        <span className="eyebrow">文档</span>
        <h1>分页文档阅读器</h1>
        <p>三篇文档按章节分页展示，所有 M3N 代码块都会以可编辑示例和五线谱预览呈现。</p>
      </section>
      <MarkdownBook documents={documents} />
    </main>
  )
}

