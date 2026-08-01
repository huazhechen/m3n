import { describe, expect, it } from 'vitest'
import { documentSections, searchForDocument } from '../lib/docs-navigation'

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
})
