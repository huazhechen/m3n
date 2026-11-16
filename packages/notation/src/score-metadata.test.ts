import { describe, expect, it } from 'vitest' 
import { scoreMetadataFromSource } from './score-metadata.js'

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

  it('indexes a tune origin independently of its composer', () => {
    const metadata = scoreMetadataFromSource('folk', '{title=民歌}{origin=爱尔兰传统民歌}{composer=作曲者}\nN: 1 2 3 4 |||')
    expect(metadata.origin).toBe('爱尔兰传统民歌')
    expect(metadata.composer).toBe('作曲者')
    expect(metadata.searchText).toContain('爱尔兰传统民歌')
  })
})
