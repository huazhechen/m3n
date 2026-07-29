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
      <MarkdownBook documents={documents} />
    </main>
  )
}
