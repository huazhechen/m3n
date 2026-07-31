import { describe, expect, it } from 'vitest'
import { searchForPage } from '../lib/docs-navigation'

describe('MarkdownBook page navigation', () => {
  it('stores the current document page in the query string', () => {
    expect(searchForPage('?mode=compact', 'manual-notes')).toBe('?mode=compact&page=manual-notes')
  })
})
