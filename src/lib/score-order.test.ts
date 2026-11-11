import { describe, expect, it } from 'vitest'
import { sortScoresByTitle } from './score-order'

describe('score title ordering', () => {
  it('interleaves Chinese pinyin and English titles alphabetically', () => {
    const scores = ['小星星', 'Zulu', '欢乐颂', '春天', 'apple', '爱尔兰画眉'].map(title => ({ title }))
    expect(sortScoresByTitle(scores).map(score => score.title)).toEqual([
      '爱尔兰画眉', 'apple', '春天', '欢乐颂', '小星星', 'Zulu',
    ])
    expect(scores[0]!.title).toBe('小星星')
  })

  it('orders equal initials by the remaining title, ignoring case and title punctuation', () => {
    const scores = ['《小星星》', '欢乐颂', 'hello 10', 'Hello 2', '花海'].map(title => ({ title }))
    expect(sortScoresByTitle(scores).map(score => score.title)).toEqual([
      'Hello 2', 'hello 10', '花海', '欢乐颂', '《小星星》',
    ])
  })
})
