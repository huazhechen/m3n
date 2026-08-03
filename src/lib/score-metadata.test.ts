import { describe, expect, it } from 'vitest'
import { scoreMetadataFromSource } from './score-metadata'

describe('scoreMetadataFromSource', () => {
  it('indexes v0.3 supplemental rows without treating form as metadata', () => {
    const metadata = scoreMetadataFromSource('00001', [
      '{title=测试} {form=A,A}',
      '{key=C} {2/4}',
      '===A',
      'N: 1 2 |',
      'B: 1d 5d |',
      'L1: 甲乙',
      'L2: {L1}',
    ].join('\n'))

    expect(metadata.hasLyrics).toBe(true)
    expect(metadata.hasBass).toBe(true)
    expect(metadata.searchText).not.toContain('a,a')
  })
})
