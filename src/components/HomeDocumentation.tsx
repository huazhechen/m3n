import { MarkdownBook } from './MarkdownBook'
import guide from '../../docs/GUIDE.md?raw'
import manual from '../../docs/MANUAL.md?raw'

const documents = [
  { id: 'guide', title: '指南', description: '循序渐进学习 M3N。', source: guide },
  { id: 'manual', title: '手册', description: '完整语法与约束速查。', source: manual },
]

export function HomeDocumentation() {
  return <MarkdownBook documents={documents} />
}
