import { describe, expect, it } from 'vitest'
import { a4SourcePageHeight } from './score-export'

describe('PDF export pagination', () => {
  it('keeps the A4 content ratio at every configured source width', () => {
    expect(a4SourcePageHeight(800)).toBe(1166)
    expect(a4SourcePageHeight(1600)).toBe(2332)
  })
})
