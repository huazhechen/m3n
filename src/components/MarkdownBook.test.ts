import { describe, expect, it } from 'vitest'
import { documentHeadings, searchForDocument } from '../lib/docs-navigation'

describe('MarkdownBook navigation', () => {
  it('stores the selected document in the query string', () => {
    expect(searchForDocument('?mode=compact&page=manual-notes', 'manual')).toBe('?mode=compact&doc=manual')
  })

  it('extracts unique anchor ids for second-level headings', () => {
    expect(documentHeadings('# Title\n\n## 时值\n\n## 时值\n\n### Ignored')).toEqual([
      { id: '时值', title: '时值' },
      { id: '时值-2', title: '时值' },
    ])
  })
})
