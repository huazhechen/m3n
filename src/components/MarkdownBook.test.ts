import { describe, expect, it } from 'vitest'
import { documentSections, searchForDocument } from '../lib/docs-navigation'
import { escapeTableCodePipes } from '../lib/markdown-table'

describe('MarkdownBook navigation', () => {
  it('stores the selected document in the query string', () => {
    expect(searchForDocument('?mode=compact&page=manual-notes', 'manual')).toBe('?mode=compact&doc=manual')
  })

  it('groups third-level headings below their second-level section', () => {
    expect(documentSections('# Title\n\n## 时值\n\n### 八分音符\n\n### 八分音符\n\n## 调号')).toEqual([
      {
        id: '时值',
        title: '时值',
        children: [
          { id: '八分音符', title: '八分音符' },
          { id: '八分音符-2', title: '八分音符' },
        ],
      },
      { id: '调号', title: '调号', children: [] },
    ])
  })

  it('escapes pipes in inline code inside Markdown tables', () => {
    expect(escapeTableCodePipes('| 写法 | 含义 |\n| --- | --- |\n| `:|||` | 结束线 |')).toBe(
      '| 写法 | 含义 |\n| --- | --- |\n| `:\\|\\|\\|` | 结束线 |',
    )
  })

  it('leaves pre-escaped pipes, ordinary text, and fenced code unchanged', () => {
    expect(escapeTableCodePipes('| 写法 | 含义 |\n| --- | --- |\n| `\\|` | 小节线 |\n\n`|||`\n\n```m3n\n`|||`\n```')).toBe(
      '| 写法 | 含义 |\n| --- | --- |\n| `\\|` | 小节线 |\n\n`|||`\n\n```m3n\n`|||`\n```',
    )
  })
})
