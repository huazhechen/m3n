import { describe, expect, it } from 'vitest'
import { scoreFileName } from './score-document'

describe('score document utilities', () => {
  it('creates a safe file name from the MEI title', () => {
    expect(scoreFileName('A/B: C?')).toBe('A-B- C-')
    expect(scoreFileName('')).toBe('m3n-score')
  })
})
