import { describe, expect, it } from 'vitest'
import { scoreMetadataFromSource } from './score-metadata'

describe('scoreMetadataFromSource', () => {
  it('indexes score metadata without treating notation directives as metadata', () => {
    const metadata = scoreMetadataFromSource('test_score_01', [
      '{title=测试} {transpose=1}',
      '{key=C} {2/4}',
      '===A',
      'N: 1 2 |',
      'B: 1d 5d |',
      'L1: 甲乙',
      'L2: {L1}',
    ].join('\n'))

    expect(metadata.hasLyrics).toBe(true)
    expect(metadata.hasBass).toBe(true)
    expect(metadata.searchText).toBe('测试')
  })
})
